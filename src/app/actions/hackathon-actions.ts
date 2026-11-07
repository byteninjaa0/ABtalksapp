"use server";

import { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { HACKATHON, isHackathonRegistrationOpen } from "@/components/hackathon/hackathon-config";
import { getParticipantIdentity } from "@/features/hackathon/registration-identity";
import { isUserRegistered } from "@/features/hackathon/registration-status";
import {
  getTeamByCode,
  getTeamLeader,
  isTeamNameTaken,
} from "@/features/hackathon/team-lookup";
import { prisma } from "@/lib/db";
import {
  sendLeaderNewMemberEmail,
  sendLeaderWelcomeEmail,
  sendMemberWelcomeEmail,
  sendSoloWelcomeEmail,
} from "@/lib/hackathon-email";
import { logger } from "@/lib/logger";
import { requiredPhoneSchema } from "@/lib/validations/phone";
import {
  hackathonRegistrationSchema,
  sourceSlugSchema,
  teamCodeSchema,
  type HackathonRegistrationInput,
} from "@/lib/validations/hackathon";
import { recordLegalConsents } from "@/features/legal/record-consent";
import { recordNewsletterOptIn } from "@/features/legal/record-newsletter-optin";

const SRC_COOKIE_NAME = "klymb_src";

async function readSourceSlug(): Promise<string | null> {
  const raw = (await cookies()).get(SRC_COOKIE_NAME)?.value;
  if (!raw) return null;
  const parsed = sourceSlugSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

const TEAM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateTeamCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += TEAM_CODE_ALPHABET[Math.floor(Math.random() * TEAM_CODE_ALPHABET.length)];
  }
  return code;
}

function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function uniqueTargetIncludes(
  error: Prisma.PrismaClientKnownRequestError,
  field: string,
): boolean {
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.includes(field);
  if (typeof target === "string") return target.includes(field);
  return false;
}

// Best-effort emails when a member joins a team: welcome the member (with team
// + lead name) and notify the leader (with the new member's name + team code).
// Failures are logged and never block registration.
async function sendTeamJoinEmails(args: {
  teamId: string;
  teamName: string | null;
  memberName: string;
  memberEmail: string;
  teamCode: string;
}): Promise<void> {
  try {
    const leader = await getTeamLeader(args.teamId);
    const teamName = args.teamName ?? "your team";
    await sendMemberWelcomeEmail(
      args.memberName,
      args.memberEmail,
      teamName,
      leader?.fullName ?? "your team lead",
    );
    if (leader) {
      await sendLeaderNewMemberEmail(
        leader.fullName,
        leader.email,
        args.memberName,
        teamName,
        args.teamCode,
      );
    }
  } catch (error) {
    logger.error("hackathon team-join emails failed", { error });
  }
}

export async function lookupHackathonTeamAction(code: string) {
  const parsed = teamCodeSchema.safeParse(code);
  if (!parsed.success) {
    return {
      ok: false as const,
      message: parsed.error.issues[0]?.message ?? "Invalid team code",
    };
  }

  const team = await getTeamByCode(parsed.data);
  if (!team) {
    return {
      ok: false as const,
      message: "No team found with that code. Check with your team leader.",
    };
  }

  if (team.entryType === "SOLO" || team.spotsLeft <= 0) {
    return { ok: false as const, message: "That team is already full." };
  }

  return {
    ok: true as const,
    data: { teamName: team.teamName, spotsLeft: team.spotsLeft },
  };
}

export async function submitHackathonRegistrationAction(
  input: HackathonRegistrationInput,
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return { ok: false as const, message: "Not authenticated" };
  }
  const userId = session.user.id;
  const email = session.user.email.trim().toLowerCase();

  if (!isHackathonRegistrationOpen()) {
    return { ok: false as const, message: "Registration is closed." };
  }

  const parsed = hackathonRegistrationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const d = parsed.data;

  // Identity comes from the account, never from the payload — the popup stopped
  // asking for it, and taking it from the client would let a crafted request
  // register someone under another name or number.
  const identity = await getParticipantIdentity(userId, session.user.name ?? "");
  const fullName = identity.fullName;
  if (fullName.length < 2) {
    return {
      ok: false as const,
      message: "Add your name to your profile, then register again.",
    };
  }

  // The profile's number wins; `d.phone` is only filled in when the popup had
  // to ask because there was none on file.
  const phoneParsed = requiredPhoneSchema.safeParse(identity.phone || d.phone);
  if (!phoneParsed.success) {
    return {
      ok: false as const,
      message:
        phoneParsed.error.issues[0]?.message ??
        "Add a WhatsApp number to your profile, then register again.",
    };
  }
  const phone = phoneParsed.data;

  const sourceSlug = await readSourceSlug();

  if (await isUserRegistered(userId)) {
    return {
      ok: false as const,
      message: "You're already registered with this email.",
    };
  }

  if (d.entryType === "TEAM_CREATE" && (await isTeamNameTaken(d.teamName))) {
    return {
      ok: false as const,
      message: "That team name is already taken. Pick another.",
    };
  }

  if (d.entryType === "SOLO" || d.entryType === "TEAM_CREATE") {
    const entryTypeDb = d.entryType === "SOLO" ? "SOLO" : "TEAM";
    const teamName = d.entryType === "TEAM_CREATE" ? d.teamName : null;

    let teamCode: string | null = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateTeamCode();
      try {
        const team = await prisma.$transaction(async (tx) => {
          const created = await tx.hackathonTeam.create({
            data: {
              eventId: HACKATHON.eventId,
              entryType: entryTypeDb,
              teamName,
              teamCode: candidate,
            },
            select: { id: true, teamCode: true },
          });
          await tx.hackathonParticipant.create({
            data: {
              eventId: HACKATHON.eventId,
              teamId: created.id,
              userId,
              slotIndex: 1,
              isLeader: true,
              fullName,
              email,
              phone,
              college: d.college,
              graduationYear: d.graduationYear,
              sourceSlug,
            },
          });
          return created;
        });
        teamCode = team.teamCode;
        break;
      } catch (error) {
        if (
          isPrismaUniqueViolation(error) &&
          uniqueTargetIncludes(
            error as Prisma.PrismaClientKnownRequestError,
            "teamCode",
          )
        ) {
          if (teamName !== null && (await isTeamNameTaken(teamName))) {
            return {
              ok: false as const,
              message: "That team name is already taken. Pick another.",
            };
          }
          continue;
        }
        logger.error("hackathon team insert failed", { error });
        return {
          ok: false as const,
          message: "Something went wrong. Please try again.",
        };
      }
    }

    if (!teamCode) {
      logger.error("hackathon team code generation exhausted");
      return {
        ok: false as const,
        message: "Something went wrong. Please try again.",
      };
    }

    try {
      if (d.entryType === "SOLO") {
        await sendSoloWelcomeEmail(fullName, email);
      } else {
        await sendLeaderWelcomeEmail(
          fullName,
          email,
          teamName ?? "your team",
          teamCode,
        );
      }
    } catch (error) {
      logger.error("hackathon welcome email failed", { error });
    }

    (await cookies()).delete(SRC_COOKIE_NAME);

    await recordLegalConsents({
      userId,
      email,
      source: "hackathon",
    });
    await recordNewsletterOptIn({
      userId,
      email,
      source: "hackathon",
      optIn: d.newsletterOptIn === true,
    });

    return {
      ok: true as const,
      data: {
        entryType: d.entryType,
        teamCode,
        teamName,
      },
    };
  }

  // TEAM_JOIN
  const team = await getTeamByCode(d.teamCode);
  if (!team) {
    return {
      ok: false as const,
      message: "No team found with that code.",
    };
  }
  if (team.entryType === "SOLO") {
    return {
      ok: false as const,
      message: "That code belongs to a solo entry.",
    };
  }
  if (team.spotsLeft <= 0) {
    return { ok: false as const, message: "That team is already full." };
  }

  type JoinFailure = "full" | "already-registered" | "slot-race" | "error";
  type JoinResult = { ok: true } | { ok: false; kind: JoinFailure };

  async function insertJoin(teamId: string): Promise<JoinResult> {
    try {
      return await prisma.$transaction(async (tx) => {
        const taken = await tx.hackathonParticipant.findMany({
          where: { eventId: HACKATHON.eventId, teamId },
          select: { slotIndex: true },
        });
        const used = new Set(taken.map((r) => r.slotIndex));
        let slotIndex = 0;
        for (let i = 1; i <= HACKATHON.maxTeamSize; i++) {
          if (!used.has(i)) {
            slotIndex = i;
            break;
          }
        }
        if (slotIndex === 0) return { ok: false as const, kind: "full" as const };

        // A previously-removed member rejoining THIS team keeps their original
        // share-link attribution, so a remove/re-add cycle can't re-attribute the
        // signup to a different link. Fresh joiners use the current visit cookie.
        const priorRemoval = await tx.hackathonRemoval.findFirst({
          where: { eventId: HACKATHON.eventId, userId, teamId },
          orderBy: { createdAt: "desc" },
          select: { sourceSlug: true },
        });

        await tx.hackathonParticipant.create({
          data: {
            eventId: HACKATHON.eventId,
            teamId,
            userId,
            slotIndex,
            isLeader: false,
            fullName,
            email,
            phone,
            college: d.college,
            graduationYear: d.graduationYear,
            sourceSlug: priorRemoval ? priorRemoval.sourceSlug : sourceSlug,
          },
        });
        return { ok: true as const };
      });
    } catch (error) {
      if (isPrismaUniqueViolation(error)) {
        const e = error as Prisma.PrismaClientKnownRequestError;
        if (uniqueTargetIncludes(e, "userId")) {
          return { ok: false, kind: "already-registered" };
        }
        if (uniqueTargetIncludes(e, "slotIndex")) {
          return { ok: false, kind: "slot-race" };
        }
      }
      logger.error("hackathon join participant insert failed", { error });
      return { ok: false, kind: "error" };
    }
  }

  let joined: JoinResult = { ok: false, kind: "slot-race" };
  for (let attempt = 0; attempt < HACKATHON.maxTeamSize; attempt++) {
    joined = await insertJoin(team.id);
    if (joined.ok || joined.kind !== "slot-race") break;
  }

  if (!joined.ok) {
    if (joined.kind === "already-registered") {
      return {
        ok: false as const,
        message: "You're already registered with this email.",
      };
    }
    if (joined.kind === "error") {
      return {
        ok: false as const,
        message: "Something went wrong. Please try again.",
      };
    }
    return {
      ok: false as const,
      message: "That team just filled up. Ask your leader for another team.",
    };
  }

  await sendTeamJoinEmails({
    teamId: team.id,
    teamName: team.teamName,
    memberName: fullName,
    memberEmail: email,
    teamCode: d.teamCode,
  });
  (await cookies()).delete(SRC_COOKIE_NAME);
  await recordLegalConsents({
    userId,
    email,
    source: "hackathon",
  });
  await recordNewsletterOptIn({
    userId,
    email,
    source: "hackathon",
    optIn: d.newsletterOptIn === true,
  });
  return {
    ok: true as const,
    data: {
      entryType: "TEAM_JOIN" as const,
      teamCode: d.teamCode,
      teamName: team.teamName,
    },
  };
}
