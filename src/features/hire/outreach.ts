import "server-only";

import type {
  OutreachAuthor,
  OutreachEmailStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger, safeErrorMessage } from "@/lib/logger";
import { sendEmail } from "@/lib/email";
import {
  existingEngagements,
  hasContactAccess,
  loadProtectedContact,
} from "@/features/hire/contact-access";
import { isUniqueViolation } from "@/repositories/credits";
import { dispatch } from "@/features/notification/notification-service";

/**
 * Recruiter ↔ candidate outreach (T-232, plan 130).
 *
 * ## Where a reply goes
 *
 * The recruiter's message reaches the candidate as a real email. The candidate
 * replies ON Klymb AI, at /messages/<thread>, and that reply is delivered to the
 * one recruiter who owns the thread: in their /hire/messages, as a bell row,
 * and as an email to their own work address via `outreach.reply_received`.
 * There is no inbound email and no shared inbox. The outreach email's Reply-To
 * is a no-reply address, and the email says so above the message (plan 130,
 * A-3).
 *
 * ## Who may do what
 *
 * - A recruiter may send only while `loadProtectedContact` hands back the
 *   candidate's address. That function is the existing contact gate; this
 *   file adds no second one.
 * - Every read is filtered on the SESSION user id. A thread id that belongs to
 *   somebody else is simply not found, never "forbidden", so there is no
 *   authorisation branch that could be forgotten.
 * - Threads are keyed on the recruiter USER. Two recruiters on one company
 *   domain never share a conversation (demo contract §2).
 *
 * ## Why the email is sent after the transaction
 *
 * Holding a pooled connection across a Brevo request is how a free-tier pool is
 * exhausted, and a failed email must not roll back a message the recruiter has
 * written. So the message commits first as PENDING, then its email outcome is
 * written onto it: SENT, SKIPPED or FAILED with sendEmail's already-redacted
 * reason. The same rule applies to `dispatch`.
 */

const TX = { maxWait: 20000, timeout: 20000 } as const;

const OUTREACH_REPLY_TO =
  process.env.OUTREACH_REPLY_TO_EMAIL || "no-reply@klymb.ai";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.klymb.ai";

/** How much of a reply the recruiter's notification previews. */
const SNIPPET_LENGTH = 280;

const THREAD_NOT_FOUND = "Conversation not found.";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

export type OutreachSendOutcome = {
  threadId: string;
  messageId: string;
  emailStatus: OutreachEmailStatus;
  emailFailureReason: string | null;
  /** True when this clientRequestId had already been written: nothing new was sent. */
  duplicate: boolean;
};

export type OutreachMessageView = {
  id: string;
  author: OutreachAuthor;
  body: string;
  /** ISO string. Dates never cross the Server→Client boundary as objects. */
  createdAt: string;
  emailStatus: OutreachEmailStatus;
  emailFailureReason: string | null;
};

export type OutreachThreadSummary = {
  id: string;
  subject: string;
  counterpartName: string;
  counterpartDetail: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  unread: boolean;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function snippet(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > SNIPPET_LENGTH
    ? `${flat.slice(0, SNIPPET_LENGTH - 1)}…`
    : flat;
}

/**
 * The recruiter-facing wording for a send that did not go out.
 *
 * `sendEmail`'s reason is redacted but technical ("BrevoError: Status code:
 * 401 Body: {…}"). That full text stays on the linked OutboundDelivery row,
 * where support (T-266/T-268) reads it. The message row carries the sentence a
 * recruiter can act on.
 */
export function readableEmailFailure(reason: string | undefined): string {
  const r = (reason ?? "").toLowerCase();
  if (r.includes("test address")) {
    return "Test account — Klymb AI never emails @abtalks.dev addresses.";
  }
  if (r.includes("brevo_api_key missing")) {
    return "Email sending isn't set up on this environment.";
  }
  if (/status code: 40[13]/.test(r)) {
    return "The email service refused Klymb AI's credentials. Our team has been alerted.";
  }
  if (/status code: 429/.test(r)) {
    return "The email service is busy. Try again in a few minutes.";
  }
  if (/status code: 400/.test(r) && r.includes("email")) {
    return "The candidate's email address was rejected by the email service.";
  }
  if (/status code: 5\d\d|econn|etimedout|fetch failed|network/.test(r)) {
    return "The email service was unavailable. Try again in a few minutes.";
  }
  return "The email service did not accept the message.";
}

/** Unread for one side: the other side spoke last, after this side last looked. */
function isUnread(
  lastMessageBy: OutreachAuthor,
  lastMessageAt: Date,
  lastReadAt: Date | null,
  reader: OutreachAuthor,
): boolean {
  if (lastMessageBy === reader) return false;
  return !lastReadAt || lastMessageAt > lastReadAt;
}

function candidateDisplayName(c: {
  name: string | null;
  candidateProfile: { fullName: string | null } | null;
}): string {
  return c.candidateProfile?.fullName || c.name || "Candidate";
}

function recruiterDisplayName(r: {
  name: string | null;
  recruiterProfile: { fullName: string } | null;
}): string {
  return r.recruiterProfile?.fullName || r.name || "A recruiter";
}

// ─── Writes ──────────────────────────────────────────────────────────────────

type Written = { threadId: string; messageId: string; subject: string };

/**
 * An earlier write with this clientRequestId, if there is one. This is how a
 * retry is recognised after the unique index refused it.
 */
async function findExistingSend(
  thread: Prisma.OutreachThreadWhereInput,
  clientRequestId: string,
) {
  return prisma.outreachMessage.findFirst({
    where: { clientRequestId, thread },
    select: {
      id: true,
      threadId: true,
      emailStatus: true,
      emailFailureReason: true,
    },
  });
}

export async function sendRecruiterMessage(input: {
  recruiterUserId: string;
  organizationId: string;
  candidateUserId: string;
  /** Only used when this starts a new conversation. */
  subject: string | null;
  body: string;
  clientRequestId: string;
  recruiterName: string;
  company: string;
}): Promise<Result<OutreachSendOutcome>> {
  const { recruiterUserId, candidateUserId, clientRequestId } = input;

  // The contact gate IS the authorisation. No address, no message.
  const contact = await loadProtectedContact(recruiterUserId, candidateUserId);
  if (!contact) {
    return {
      ok: false,
      message: "Unlock this candidate's contact details before messaging them.",
    };
  }

  const engagement = (
    await existingEngagements(recruiterUserId, [candidateUserId])
  ).get(candidateUserId);

  const write = () =>
    prisma.$transaction(async (tx): Promise<Written> => {
      const now = new Date();
      const thread = await tx.outreachThread.upsert({
        where: {
          recruiterUserId_candidateUserId: { recruiterUserId, candidateUserId },
        },
        create: {
          recruiterUserId,
          organizationId: input.organizationId,
          candidateUserId,
          engagementId: engagement?.id ?? null,
          subject: input.subject || `Message from ${input.company}`,
          lastMessageAt: now,
          lastMessageBy: "RECRUITER",
          recruiterLastReadAt: now,
        },
        update: {
          lastMessageAt: now,
          lastMessageBy: "RECRUITER",
          recruiterLastReadAt: now,
        },
        select: { id: true, subject: true },
      });
      const message = await tx.outreachMessage.create({
        data: {
          threadId: thread.id,
          author: "RECRUITER",
          authorUserId: recruiterUserId,
          body: input.body,
          clientRequestId,
          emailStatus: "PENDING",
        },
        select: { id: true },
      });
      return { threadId: thread.id, messageId: message.id, subject: thread.subject };
    }, TX);

  let written: Written;
  try {
    written = await writeOnce(write);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await findExistingSend(
      { recruiterUserId, candidateUserId },
      clientRequestId,
    );
    if (!existing) throw error;
    return {
      ok: true,
      data: {
        threadId: existing.threadId,
        messageId: existing.id,
        emailStatus: existing.emailStatus,
        emailFailureReason: existing.emailFailureReason,
        duplicate: true,
      },
    };
  }

  const { emailStatus, emailFailureReason } = await emailCandidate({
    to: contact.email,
    messageId: written.messageId,
    threadId: written.threadId,
    subject: written.subject,
    body: input.body,
    recruiterName: input.recruiterName,
    company: input.company,
  });

  // In-app, never email (the registry makes it "low"), so the candidate is not
  // told twice. A failure here is logged: the message and its email already
  // exist, and the bell is a convenience on top of them.
  try {
    await dispatch({
      eventType: "outreach.message_received",
      recipientUserId: candidateUserId,
      primaryEntityId: written.messageId,
      title: `${input.recruiterName} at ${input.company} sent you a message`,
      body: snippet(input.body),
      href: `/messages/${written.threadId}`,
    });
  } catch (error) {
    logger.error("[outreach] candidate notification failed", {
      messageId: written.messageId,
      error: safeErrorMessage(error),
    });
  }

  return {
    ok: true,
    data: {
      threadId: written.threadId,
      messageId: written.messageId,
      emailStatus,
      emailFailureReason,
      duplicate: false,
    },
  };
}

/**
 * Two first messages to the same candidate can both reach the thread upsert's
 * INSERT; one loses on the (recruiter, candidate) unique index. That loser is
 * not a duplicate send — it just needs to append to the thread the winner
 * created — so it gets exactly one more attempt. A second unique violation is
 * a genuine clientRequestId retry and goes to the caller.
 */
async function writeOnce<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return write();
  }
}

/**
 * The email the candidate receives. Pure, so it can be tested and looked at.
 *
 * The do-not-reply notice sits ABOVE the message (plan 130, A-3): a candidate
 * pressing Reply in their mail client reaches no-reply, so they have to see
 * where replies actually go before they read anything else.
 */
export function buildOutreachEmail(input: {
  threadId: string;
  subject: string;
  body: string;
  recruiterName: string;
  company: string;
}): { subject: string; html: string; text: string } {
  const link = `${APP_URL}/messages/${input.threadId}`;
  const who = `${input.recruiterName} at ${input.company}`;
  const name = escapeHtml(input.recruiterName);
  const whoHtml = escapeHtml(who);
  const bodyHtml = escapeHtml(input.body);

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#111;line-height:1.5">
  <p style="background:#FFF4E5;border:1px solid #F5C77E;border-radius:6px;padding:12px 14px;margin:0 0 20px">
    <strong>Do not reply to this email</strong> &mdash; replies to it are not delivered.
    <a href="${link}" style="color:#0B57D0">Click here to view the conversation</a> and reply to ${name} on Klymb AI.
  </p>
  <p style="margin:0 0 12px">${whoHtml} sent you a message on Klymb AI:</p>
  <div style="white-space:pre-wrap;border-left:3px solid #ddd;padding:4px 0 4px 14px;margin:0 0 20px">${bodyHtml}</div>
  <p style="margin:0 0 24px">
    <a href="${link}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px">View and reply on Klymb AI</a>
  </p>
  <p style="font-size:12px;color:#666;margin:0">You received this because a recruiter at ${escapeHtml(input.company)} has access to your contact details on Klymb AI. Your reply goes only to ${name}.</p>
</div>`;

  const text = [
    "DO NOT REPLY TO THIS EMAIL - replies to it are not delivered.",
    `View the conversation and reply to ${input.recruiterName} on Klymb AI: ${link}`,
    "",
    `${who} sent you a message on Klymb AI:`,
    "",
    input.body,
    "",
    `View and reply: ${link}`,
    "",
    `You received this because a recruiter at ${input.company} has access to your contact details on Klymb AI. Your reply goes only to ${input.recruiterName}.`,
  ].join("\n");

  return { subject: `${who}: ${input.subject}`, html, text };
}

async function emailCandidate(input: {
  to: string | null;
  messageId: string;
  threadId: string;
  subject: string;
  body: string;
  recruiterName: string;
  company: string;
}): Promise<{ emailStatus: OutreachEmailStatus; emailFailureReason: string | null }> {
  let emailStatus: OutreachEmailStatus;
  let emailFailureReason: string | null = null;
  let technicalReason: string | undefined;
  let emailDeliveryId: string | null = null;

  if (!input.to) {
    emailStatus = "SKIPPED";
    emailFailureReason = "The candidate has no email address on file.";
  } else {
    const email = buildOutreachEmail(input);
    try {
      const result = await sendEmail({
        to: input.to,
        replyTo: OUTREACH_REPLY_TO,
        ...email,
        kind: "outreach.message",
        subjectType: "OutreachMessage",
        subjectId: input.messageId,
      });
      emailDeliveryId = result.deliveryId;
      if (result.ok) {
        emailStatus = "SENT";
      } else {
        emailStatus = result.skipped ? "SKIPPED" : "FAILED";
        technicalReason = result.reason;
        emailFailureReason = readableEmailFailure(result.reason);
      }
    } catch (error) {
      // sendEmail catches provider errors itself; reaching here means its own
      // bookkeeping failed. Still a failed send, still recorded with a reason.
      emailStatus = "FAILED";
      technicalReason = safeErrorMessage(error);
      emailFailureReason = readableEmailFailure(technicalReason);
    }
  }

  if (emailStatus === "FAILED") {
    logger.warn("[outreach] email not delivered", {
      messageId: input.messageId,
      deliveryId: emailDeliveryId,
      reason: technicalReason,
    });
  }

  await prisma.outreachMessage.update({
    where: { id: input.messageId },
    data: { emailStatus, emailFailureReason, emailDeliveryId },
    select: { id: true },
  });

  return { emailStatus, emailFailureReason };
}

export async function sendCandidateReply(input: {
  candidateUserId: string;
  threadId: string;
  body: string;
  clientRequestId: string;
}): Promise<Result<{ threadId: string; messageId: string; duplicate: boolean }>> {
  const { candidateUserId, threadId, clientRequestId } = input;

  // Scoped to the caller: somebody else's thread id is a miss, not a refusal.
  const thread = await prisma.outreachThread.findFirst({
    where: { id: threadId, candidateUserId },
    select: {
      id: true,
      recruiterUserId: true,
      candidate: {
        select: { name: true, candidateProfile: { select: { fullName: true } } },
      },
    },
  });
  if (!thread) return { ok: false, message: THREAD_NOT_FOUND };

  let messageId: string;
  try {
    messageId = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const message = await tx.outreachMessage.create({
        data: {
          threadId: thread.id,
          author: "CANDIDATE",
          authorUserId: candidateUserId,
          body: input.body,
          clientRequestId,
          emailStatus: "NONE",
        },
        select: { id: true },
      });
      await tx.outreachThread.update({
        where: { id: thread.id },
        data: {
          lastMessageAt: now,
          lastMessageBy: "CANDIDATE",
          candidateLastReadAt: now,
        },
        select: { id: true },
      });
      return message.id;
    }, TX);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await findExistingSend(
      { id: thread.id, candidateUserId },
      clientRequestId,
    );
    if (!existing) throw error;
    return {
      ok: true,
      data: { threadId: thread.id, messageId: existing.id, duplicate: true },
    };
  }

  // To the thread's recruiter and nobody else: bell + their own work email.
  // The reply is already saved, so a notification failure is logged, never
  // surfaced as a failed reply.
  try {
    const sent = await dispatch({
      eventType: "outreach.reply_received",
      recipientUserId: thread.recruiterUserId,
      primaryEntityId: messageId,
      title: `${candidateDisplayName(thread.candidate)} replied to your message`,
      body: snippet(input.body),
      href: `/hire/messages/${thread.id}`,
    });
    if (!sent.ok) {
      logger.error("[outreach] reply notification refused", {
        messageId,
        message: sent.message,
      });
    }
  } catch (error) {
    logger.error("[outreach] reply notification failed", {
      messageId,
      error: safeErrorMessage(error),
    });
  }

  return { ok: true, data: { threadId: thread.id, messageId, duplicate: false } };
}

// ─── Reads (recruiter) ───────────────────────────────────────────────────────

export async function listRecruiterThreads(
  recruiterUserId: string,
): Promise<OutreachThreadSummary[]> {
  const threads = await prisma.outreachThread.findMany({
    where: { recruiterUserId },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    select: {
      id: true,
      subject: true,
      lastMessageAt: true,
      lastMessageBy: true,
      recruiterLastReadAt: true,
      candidate: {
        select: { name: true, candidateProfile: { select: { fullName: true } } },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true },
      },
    },
  });

  return threads.map((t) => ({
    id: t.id,
    subject: t.subject,
    counterpartName: candidateDisplayName(t.candidate),
    counterpartDetail: "Candidate",
    lastMessageAt: t.lastMessageAt.toISOString(),
    lastMessagePreview: snippet(t.messages[0]?.body ?? ""),
    unread: isUnread(t.lastMessageBy, t.lastMessageAt, t.recruiterLastReadAt, "RECRUITER"),
  }));
}

export async function getRecruiterThread(
  recruiterUserId: string,
  threadId: string,
): Promise<{
  id: string;
  subject: string;
  candidateName: string;
  /** False once contact access is gone: history stays, sending stops (O-12). */
  canSend: boolean;
  messages: OutreachMessageView[];
} | null> {
  const thread = await prisma.outreachThread.findFirst({
    where: { id: threadId, recruiterUserId },
    select: {
      id: true,
      subject: true,
      candidateUserId: true,
      candidate: {
        select: { name: true, candidateProfile: { select: { fullName: true } } },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        take: 200,
        select: {
          id: true,
          author: true,
          body: true,
          createdAt: true,
          emailStatus: true,
          emailFailureReason: true,
        },
      },
    },
  });
  if (!thread) return null;

  const [canSend] = await Promise.all([
    hasContactAccess(recruiterUserId, thread.candidateUserId),
    prisma.outreachThread.updateMany({
      where: { id: thread.id, recruiterUserId },
      data: { recruiterLastReadAt: new Date() },
    }),
  ]);

  return {
    id: thread.id,
    subject: thread.subject,
    candidateName: candidateDisplayName(thread.candidate),
    canSend,
    messages: thread.messages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export async function countUnreadForRecruiter(
  recruiterUserId: string,
): Promise<number> {
  // Prisma cannot compare two columns in a where, so only the threads where
  // the candidate spoke last are fetched and compared here. That set is small.
  const threads = await prisma.outreachThread.findMany({
    where: { recruiterUserId, lastMessageBy: "CANDIDATE" },
    select: { lastMessageAt: true, lastMessageBy: true, recruiterLastReadAt: true },
    take: 500,
  });
  return threads.filter((t) =>
    isUnread(t.lastMessageBy, t.lastMessageAt, t.recruiterLastReadAt, "RECRUITER"),
  ).length;
}

/** The thread a recruiter already has with this candidate, if any. */
export async function findRecruiterThreadId(
  recruiterUserId: string,
  candidateUserId: string,
): Promise<string | null> {
  const thread = await prisma.outreachThread.findUnique({
    where: {
      recruiterUserId_candidateUserId: { recruiterUserId, candidateUserId },
    },
    select: { id: true },
  });
  return thread?.id ?? null;
}

// ─── Reads (candidate) ───────────────────────────────────────────────────────
// Nothing on this path selects a recruiter's email. The candidate sees a name
// and a company, never an address.

export async function listCandidateThreads(
  candidateUserId: string,
): Promise<OutreachThreadSummary[]> {
  const threads = await prisma.outreachThread.findMany({
    where: { candidateUserId },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    select: {
      id: true,
      subject: true,
      lastMessageAt: true,
      lastMessageBy: true,
      candidateLastReadAt: true,
      organization: { select: { name: true } },
      recruiter: {
        select: { name: true, recruiterProfile: { select: { fullName: true } } },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true },
      },
    },
  });

  return threads.map((t) => ({
    id: t.id,
    subject: t.subject,
    counterpartName: recruiterDisplayName(t.recruiter),
    counterpartDetail: t.organization.name,
    lastMessageAt: t.lastMessageAt.toISOString(),
    lastMessagePreview: snippet(t.messages[0]?.body ?? ""),
    unread: isUnread(t.lastMessageBy, t.lastMessageAt, t.candidateLastReadAt, "CANDIDATE"),
  }));
}

export async function getCandidateThread(
  candidateUserId: string,
  threadId: string,
): Promise<{
  id: string;
  subject: string;
  recruiterName: string;
  company: string;
  messages: Omit<OutreachMessageView, "emailStatus" | "emailFailureReason">[];
} | null> {
  const thread = await prisma.outreachThread.findFirst({
    where: { id: threadId, candidateUserId },
    select: {
      id: true,
      subject: true,
      organization: { select: { name: true } },
      recruiter: {
        select: { name: true, recruiterProfile: { select: { fullName: true } } },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        take: 200,
        select: { id: true, author: true, body: true, createdAt: true },
      },
    },
  });
  if (!thread) return null;

  await prisma.outreachThread.updateMany({
    where: { id: thread.id, candidateUserId },
    data: { candidateLastReadAt: new Date() },
  });

  return {
    id: thread.id,
    subject: thread.subject,
    recruiterName: recruiterDisplayName(thread.recruiter),
    company: thread.organization.name,
    messages: thread.messages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}
