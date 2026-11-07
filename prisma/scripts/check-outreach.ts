/**
 * T-232 — outreach's database-backed proofs (plan 130 §8, tests 9–16).
 *
 * Isolation by id, one message per clientRequestId under concurrency, the reply
 * notification reaching exactly one recruiter, and a failed email leaving a
 * readable reason — all database behaviour, so all proved against Postgres.
 *
 * Writes scratch users, a scratch organization and their threads, then removes
 * them. Refuses to run against production. Every scratch address is
 * @abtalks.dev, which sendEmail never mails; the one forced-failure proof uses
 * a deliberately invalid API key, so nothing is delivered anywhere.
 *
 * Run: npm run db:check:outreach
 */
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  countUnreadForRecruiter,
  getCandidateThread,
  getRecruiterThread,
  listCandidateThreads,
  listRecruiterThreads,
  sendCandidateReply,
  sendRecruiterMessage,
} from "../../src/features/hire/outreach";

const prisma = new PrismaClient();

/** Same guard check-credit-ledger.ts uses. Do not weaken it. */
const PRODUCTION_NEON_HOST_ID = "ep-nameless-term-ams9a5e3";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`);
  }
}

type Scratch = {
  organizationId: string;
  recruiterA: string;
  recruiterB: string;
  candidate1: string;
  candidate2: string;
  candidate3: string;
};

const stamp = Date.now();

async function makeUser(label: string, role: "RECRUITER" | "STUDENT") {
  const user = await prisma.user.create({
    data: { email: `outreach-proof-${label}-${stamp}@abtalks.dev`, name: `Proof ${label}`, role },
    select: { id: true },
  });
  return user.id;
}

async function makeScratch(): Promise<Scratch> {
  const [recruiterA, recruiterB, candidate1, candidate2, candidate3] = await Promise.all([
    makeUser("recruiter-a", "RECRUITER"),
    makeUser("recruiter-b", "RECRUITER"),
    makeUser("candidate-1", "STUDENT"),
    makeUser("candidate-2", "STUDENT"),
    makeUser("candidate-3", "STUDENT"),
  ]);
  // One organization, both recruiters: the same-company-domain case the
  // regression guard is about.
  const org = await prisma.organization.create({
    data: { slug: `outreach-proof-${stamp}`, name: "Outreach Proof Ltd" },
    select: { id: true },
  });
  await prisma.organizationMember.createMany({
    data: [recruiterA, recruiterB].map((userId) => ({
      organizationId: org.id,
      userId,
      role: "RECRUITER" as const,
      status: "ACTIVE" as const,
      joinedAt: new Date(),
    })),
  });
  return { organizationId: org.id, recruiterA, recruiterB, candidate1, candidate2, candidate3 };
}

async function grantContact(recruiterUserId: string, candidateUserId: string) {
  const e = await prisma.talentEngagementRequest.create({
    data: {
      recruiterUserId,
      candidateUserId,
      candidatePublicId: "AB-9999",
      source: "PROFILE",
      status: "CONTACT_SHARED",
      decidedAt: new Date(),
    },
    select: { id: true },
  });
  return e.id;
}

async function dropScratch(s: Scratch) {
  const users = [s.recruiterA, s.recruiterB, s.candidate1, s.candidate2, s.candidate3];
  const messages = await prisma.outreachMessage.findMany({
    where: { thread: { organizationId: s.organizationId } },
    select: { id: true },
  });
  await prisma.outboundDelivery.deleteMany({
    where: { subjectType: "OutreachMessage", subjectId: { in: messages.map((m) => m.id) } },
  });
  const notifications = await prisma.userNotification.findMany({
    where: { recipientUserId: { in: users } },
    select: { id: true },
  });
  await prisma.notificationDelivery.deleteMany({
    where: { notificationId: { in: notifications.map((n) => n.id) } },
  });
  await prisma.userNotification.deleteMany({ where: { recipientUserId: { in: users } } });
  await prisma.outreachThread.deleteMany({ where: { organizationId: s.organizationId } });
  await prisma.talentEngagementRequest.deleteMany({ where: { recruiterUserId: { in: users } } });
  await prisma.organizationMember.deleteMany({ where: { organizationId: s.organizationId } });
  await prisma.organization.delete({ where: { id: s.organizationId } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}

function recruiterInput(s: Scratch, candidateUserId: string, body: string, clientRequestId = randomUUID()) {
  return {
    recruiterUserId: s.recruiterA,
    organizationId: s.organizationId,
    candidateUserId,
    subject: "Proof role",
    body,
    clientRequestId,
    recruiterName: "Proof Recruiter A",
    company: "Outreach Proof Ltd",
  };
}

async function main() {
  if ((process.env.DATABASE_URL ?? "").includes(PRODUCTION_NEON_HOST_ID)) {
    console.error("Refusing to run outreach proofs against production.");
    process.exit(1);
  }

  console.log("\nT-232 outreach — database proofs\n");
  const s = await makeScratch();

  try {
    /* 9. no access, no message */
    const refused = await sendRecruiterMessage(recruiterInput(s, s.candidate1, "Hello"));
    const threadsBefore = await prisma.outreachThread.count({ where: { organizationId: s.organizationId } });
    check("recruiter without contact access is refused", !refused.ok);
    check("…and nothing was written", threadsBefore === 0);

    /* 10. with access: one thread, one message, one delivery row */
    await grantContact(s.recruiterA, s.candidate1);
    const first = await sendRecruiterMessage(recruiterInput(s, s.candidate1, "First message"));
    check("recruiter with access can send", first.ok, first.ok ? undefined : first.message);
    if (!first.ok) throw new Error("cannot continue without a first message");
    const threadId = first.data.threadId;

    const msg = await prisma.outreachMessage.findUnique({
      where: { id: first.data.messageId },
      select: { emailStatus: true, emailFailureReason: true, emailDeliveryId: true },
    });
    const delivery = await prisma.outboundDelivery.findFirst({
      where: { subjectType: "OutreachMessage", subjectId: first.data.messageId },
      select: { status: true, kind: true },
    });
    check(
      "email outcome is written onto the message (test address → SKIPPED with a reason)",
      msg?.emailStatus === "SKIPPED" && Boolean(msg.emailFailureReason) && Boolean(msg.emailDeliveryId),
      JSON.stringify(msg),
    );
    check(
      "…and matches the OutboundDelivery row",
      delivery?.status === "SKIPPED" && delivery.kind === "outreach.message",
      JSON.stringify(delivery),
    );

    const candidateBell = await prisma.userNotification.findMany({
      where: { recipientUserId: s.candidate1, eventType: "outreach.message_received" },
      select: { id: true, deliveries: { select: { channel: true } } },
    });
    check(
      "candidate gets one in-app notification and no notification email",
      candidateBell.length === 1 &&
        candidateBell[0].deliveries.every((d) => d.channel === "in_app"),
      JSON.stringify(candidateBell),
    );

    /* 11. idempotency */
    const retryId = randomUUID();
    const r1 = await sendRecruiterMessage(recruiterInput(s, s.candidate1, "Retry me", retryId));
    const r2 = await sendRecruiterMessage(recruiterInput(s, s.candidate1, "Retry me", retryId));
    const retryRows = await prisma.outreachMessage.count({ where: { clientRequestId: retryId } });
    check("a retried send is recognised as a duplicate", r1.ok && r2.ok && r2.data.duplicate && !r1.data.duplicate);
    check("…and wrote one message", retryRows === 1, `rows=${retryRows}`);

    const concurrentId = randomUUID();
    const burst = await Promise.all(
      Array.from({ length: 5 }, () =>
        sendRecruiterMessage(recruiterInput(s, s.candidate1, "Double click", concurrentId)),
      ),
    );
    const burstRows = await prisma.outreachMessage.count({ where: { clientRequestId: concurrentId } });
    const burstDeliveries = await prisma.outboundDelivery.count({
      where: {
        subjectType: "OutreachMessage",
        subjectId: {
          in: (await prisma.outreachMessage.findMany({
            where: { clientRequestId: concurrentId },
            select: { id: true },
          })).map((m) => m.id),
        },
      },
    });
    check("5 concurrent sends with one id → one message", burstRows === 1 && burst.every((b) => b.ok), `rows=${burstRows}`);
    check("…and one email attempt", burstDeliveries === 1, `deliveries=${burstDeliveries}`);

    await grantContact(s.recruiterA, s.candidate3);
    const race = await Promise.all(
      Array.from({ length: 4 }, (_, i) => sendRecruiterMessage(recruiterInput(s, s.candidate3, `Race ${i}`))),
    );
    const raceThreads = await prisma.outreachThread.count({
      where: { recruiterUserId: s.recruiterA, candidateUserId: s.candidate3 },
    });
    const raceMessages = await prisma.outreachMessage.count({
      where: { thread: { recruiterUserId: s.recruiterA, candidateUserId: s.candidate3 } },
    });
    check(
      "4 concurrent FIRST messages → one thread, four messages",
      race.every((r) => r.ok) && raceThreads === 1 && raceMessages === 4,
      `ok=${race.map((r) => r.ok).join(",")} threads=${raceThreads} messages=${raceMessages}`,
    );

    /* 12. recruiter B, same organization */
    check("recruiter B cannot open A's thread by id", (await getRecruiterThread(s.recruiterB, threadId)) === null);
    check("recruiter B's list is empty", (await listRecruiterThreads(s.recruiterB)).length === 0);
    const bSend = await sendRecruiterMessage({ ...recruiterInput(s, s.candidate1, "B tries"), recruiterUserId: s.recruiterB });
    check("recruiter B cannot message A's candidate without their own unlock", !bSend.ok);

    /* 13. candidate isolation */
    const c2Reply = await sendCandidateReply({
      candidateUserId: s.candidate2,
      threadId,
      body: "Not my thread",
      clientRequestId: randomUUID(),
    });
    check("another candidate cannot reply to the thread", !c2Reply.ok);
    check("…or read it", (await getCandidateThread(s.candidate2, threadId)) === null);
    check("the candidate sees their own thread", (await listCandidateThreads(s.candidate1)).length === 1);

    /* 14. reply routing */
    const replyId = randomUUID();
    const reply = await sendCandidateReply({
      candidateUserId: s.candidate1,
      threadId,
      body: "Thanks — interested!",
      clientRequestId: replyId,
    });
    check("candidate can reply on Klymb AI", reply.ok, reply.ok ? undefined : reply.message);
    const replay = await sendCandidateReply({
      candidateUserId: s.candidate1,
      threadId,
      body: "Thanks — interested!",
      clientRequestId: replyId,
    });
    check("a replayed reply is a duplicate", replay.ok && replay.data.duplicate);

    const aNotes = await prisma.userNotification.findMany({
      where: { recipientUserId: s.recruiterA, eventType: "outreach.reply_received" },
      select: { href: true, deliveries: { select: { channel: true } } },
    });
    const bNotes = await prisma.userNotification.count({
      where: { recipientUserId: s.recruiterB, eventType: "outreach.reply_received" },
    });
    check(
      "the reply notifies recruiter A exactly once, in-app and by email",
      aNotes.length === 1 &&
        aNotes[0].href === `/hire/messages/${threadId}` &&
        aNotes[0].deliveries.some((d) => d.channel === "email"),
      JSON.stringify(aNotes),
    );
    check("recruiter B is not notified", bNotes === 0);

    check("A has one unread conversation", (await countUnreadForRecruiter(s.recruiterA)) === 1);
    const aThread = await getRecruiterThread(s.recruiterA, threadId);
    check("…the reply is in A's history", Boolean(aThread?.messages.some((m) => m.author === "CANDIDATE")));
    check("…and opening it marks it read", (await countUnreadForRecruiter(s.recruiterA)) === 0);

    /* 15. forced send failure */
    await prisma.user.update({
      where: { id: s.candidate1 },
      data: { email: `outreach-proof-fail-${stamp}@example.invalid` },
    });
    const realKey = process.env.BREVO_API_KEY;
    process.env.BREVO_API_KEY = "invalid-key-for-t232-proof";
    const failing = await sendRecruiterMessage(recruiterInput(s, s.candidate1, "This email should fail"));
    if (realKey === undefined) delete process.env.BREVO_API_KEY;
    else process.env.BREVO_API_KEY = realKey;
    await prisma.user.update({
      where: { id: s.candidate1 },
      data: { email: `outreach-proof-candidate-1-${stamp}@abtalks.dev` },
    });
    check(
      "a provider failure is recorded as FAILED with a readable reason",
      failing.ok && failing.data.emailStatus === "FAILED" && Boolean(failing.data.emailFailureReason),
      failing.ok ? JSON.stringify(failing.data) : failing.message,
    );
    check(
      "…in words a recruiter can read",
      failing.ok && Boolean(failing.data.emailFailureReason?.includes("credentials")),
      failing.ok ? String(failing.data.emailFailureReason) : undefined,
    );
    const failedDelivery = failing.ok
      ? await prisma.outboundDelivery.findFirst({
          where: { subjectType: "OutreachMessage", subjectId: failing.data.messageId },
          select: { status: true, failureReason: true },
        })
      : null;
    check(
      "…while the technical reason is kept on OutboundDelivery",
      failedDelivery?.status === "FAILED" && Boolean(failedDelivery.failureReason?.includes("401")),
      JSON.stringify(failedDelivery),
    );
    check(
      "…and the message is still saved",
      failing.ok && (await prisma.outreachMessage.count({ where: { id: failing.data.messageId } })) === 1,
    );

    /* 16. revoked access */
    await prisma.talentEngagementRequest.updateMany({
      where: { recruiterUserId: s.recruiterA, candidateUserId: s.candidate1 },
      data: { status: "CLOSED" },
    });
    const revoked = await getRecruiterThread(s.recruiterA, threadId);
    const afterRevoke = await sendRecruiterMessage(recruiterInput(s, s.candidate1, "After revoke"));
    check("after revocation the history is still readable", Boolean(revoked && revoked.messages.length > 0));
    check("…but canSend is false", revoked?.canSend === false);
    check("…and a send is refused", !afterRevoke.ok);
  } finally {
    await dropScratch(s);
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
