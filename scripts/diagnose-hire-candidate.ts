/**
 * Why did /hire not return this person?
 *
 *   npm run diagnose:hire -- ayushgoelar@gmail.com
 *   npm run diagnose:hire -- ayushgoelar@gmail.com --title "senior manager" --min-exp 10
 *
 * READ ONLY. It opens one Prisma client, runs selects, and prints. It writes
 * nothing and changes no flag.
 *
 * WHY THIS EXISTS
 *
 * "There is a profile on the platform and the search says there is not" has
 * four completely different causes, and from the recruiter's side they all look
 * identical:
 *
 *   1. The person is not in any track /hire searches (the track is behind a
 *      flag, or they are enrolled in nothing).
 *   2. They are in a track but not discoverable (visibility override, or a
 *      program status that is not ENROLLED / COMPLETED).
 *   3. They are loaded but below the evidence floor.
 *   4. They are loaded and ranked, and a hard filter removed them.
 *
 * Only the fourth is a scoring question. This prints which one it is, in that
 * order, so nobody has to guess again.
 */
import { PrismaClient } from "@prisma/client";
import { hireChallengePool, hireOpenCohortIds } from "@/lib/feature-flags";
import { enabledTracks, describeTracks } from "@/features/hire/track-registry";

const prisma = new PrismaClient();

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? (process.argv[i + 1] ?? null) : null;
}

function head(title: string) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 60 - title.length))}`);
}

async function main() {
  const email = process.argv[2];
  if (!email || email.startsWith("--")) {
    console.error("usage: npm run diagnose:hire -- <email> [--title '…'] [--min-exp N]");
    process.exit(1);
  }

  head("flags");
  const challenge = hireChallengePool();
  console.log("HIRE_CHALLENGE_POOL   :", process.env.HIRE_CHALLENGE_POOL ?? "(unset)");
  console.log("  → challenge tracks  :", challenge.enabled ? `ON (min ${challenge.minDays} days)` : "OFF");
  console.log("HIRE_OPEN_COHORT_IDS  :", process.env.HIRE_OPEN_COHORT_IDS ?? "(unset)");
  console.log("  → resolved          :", JSON.stringify(hireOpenCohortIds()));
  console.log(
    "tracks /hire searches :",
    enabledTracks().map((t) => t.label).join(", ") || "(none)",
  );
  const off = describeTracks().length;
  console.log(`  (${enabledTracks().length} enabled of ${off} described)`);

  head("user");
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  if (!user) {
    console.log(`No user with email ${email}. Nothing else to check.`);
    return;
  }
  console.log(user);

  head("profile");
  const profile = await prisma.studentProfile.findFirst({
    where: { userId: user.id },
    select: {
      role: true,
      skills: true,
      yearsExperience: true,
      graduationYear: true,
      organization: true,
    },
  });
  console.log(profile ?? "(no StudentProfile row)");
  if (profile) {
    if (profile.yearsExperience == null) {
      console.log(
        "  ! yearsExperience is NULL — a stated minimum can only ever be a gap on this card, never a match.",
      );
    }
    if (!profile.role?.trim()) {
      console.log("  ! role is blank — no role family, so a stated role cannot be confirmed.");
    }
  }

  head("visibility");
  const vis = await prisma.candidateVisibility.findUnique({
    where: { userId: user.id },
    select: { searchableByRecruiters: true, withdrawnAt: true, updatedAt: true },
  });
  console.log(vis ?? "(no explicit row — discoverable by default)");
  if (vis && vis.withdrawnAt) {
    console.log("  ! withdrawnAt is set — hidden from every recruiter surface.");
  } else if (vis && !vis.searchableByRecruiters) {
    console.log(
      "  ! searchableByRecruiters is FALSE — a historical flag; /hire still shows them unless withdrawnAt is set.",
    );
  }

  head("program membership");
  const members = await prisma.programMember.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      status: true,
      jobRole: true,
      yearsExperience: true,
      cohort: { select: { id: true, name: true, resultsPublishedAt: true } },
    },
  });
  console.log(members.length ? members : "(not a program member)");

  head("challenge enrolments");
  const enrolments = await prisma.enrollment.findMany({
    where: { userId: user.id },
    select: {
      domain: true,
      startedAt: true,
      daysCompleted: true,
      _count: { select: { submissions: true } },
    },
  });
  if (!enrolments.length) console.log("(no enrolments)");
  for (const e of enrolments) {
    const days = e._count.submissions;
    const reachable = challenge.enabled && days >= challenge.minDays;
    console.log(
      `${e.domain}: ${days} submitted day(s) — ${
        reachable
          ? "reachable by /hire"
          : !challenge.enabled
            ? "UNREACHABLE: challenge tracks are off (HIRE_CHALLENGE_POOL=false)"
            : `UNREACHABLE: below the ${challenge.minDays}-day floor`
      }`,
    );
  }

  // Search loads hackathon teams that shipped a repo; a participant with no
  // submission is enrolled, not searchable. Challenge tracks are on unless
  // HIRE_CHALLENGE_POOL=false.
  head("hackathon");
  const hackathonOn = enabledTracks().some((t) => t.slug === "HACKATHON");
  const hackathon = await prisma.hackathonParticipant.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      isLeader: true,
      team: {
        select: {
          id: true,
          teamCode: true,
          teamName: true,
          submission: { select: { id: true } },
        },
      },
    },
  });
  if (!hackathon) {
    console.log("(not a hackathon participant)");
  } else {
    console.log({
      id: hackathon.id,
      isLeader: hackathon.isLeader,
      teamCode: hackathon.team.teamCode,
      teamName: hackathon.team.teamName,
      shipped: Boolean(hackathon.team.submission),
    });
    if (!hackathonOn) {
      console.log("  ! HACKATHON is not in enabledTracks() — /hire will not load them.");
    } else if (!hackathon.team.submission) {
      console.log("  ! team has no submission — /hire only loads teams that shipped a repo.");
    } else {
      console.log("  reachable by /hire (hackathon has no cohort gate)");
    }
  }

  head("verdict");
  const inProgram = members.some(
    (m) => m.status === "ENROLLED" || m.status === "COMPLETED",
  );
  const inChallenge = enrolments.some(
    (e) => challenge.enabled && e._count.submissions >= challenge.minDays,
  );
  const inHackathon = Boolean(hackathon?.team.submission) && hackathonOn;
  if (!inProgram && !inChallenge && !inHackathon) {
    console.log(
      "This person is NOT in any pool /hire searches. No scoring change can surface them —\n" +
        "either enable the track that holds them, or enrol them in one that is on.",
    );
  } else {
    console.log(
      "This person IS loaded into the pool. If a search still misses them, it is scoring:\n" +
        "check the gaps printed on their card against the stated requirement.",
    );
    const title = arg("title");
    const minExp = arg("min-exp");
    if (title || minExp) {
      console.log(
        `\nAgainst title=${title ?? "—"} minExperience=${minExp ?? "—"}: role and years are\n` +
          "hard filters ONLY when the candidate's own value is known and conflicts.\n" +
          "A blank role or a null yearsExperience is reported as a gap and still ranks.",
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
