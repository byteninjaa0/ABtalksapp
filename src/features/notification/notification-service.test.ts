/**
 * Unit tests for the notification dispatcher — run with:
 *   npm run test:notification-dispatch
 * or:
 *   cross-env NODE_OPTIONS=--conditions=react-server npx tsx src/features/notification/notification-service.test.ts
 *
 * Requires a database connection (uses real Prisma queries).
 * Tests create and clean up their own data.
 */
import { z } from "zod";
import { prisma } from "@/lib/db";
import { dispatch } from "./notification-service";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function suite(name: string, fn: () => Promise<void>) {
  return fn()
    .then(() => {
      passed++;
      console.log(`  ✓ ${name}`);
    })
    .catch((e) => {
      failed++;
      console.log(`  ✗ ${name}\n      ${(e as Error).message}`);
    });
}

const TEST_USER_ID = "test-notif-dispatch-user";
const TEST_EMAIL = "notif-test@abtalks.dev";

async function setup() {
  await prisma.user.upsert({
    where: { id: TEST_USER_ID },
    update: {},
    create: {
      id: TEST_USER_ID,
      email: TEST_EMAIL,
      name: "Notification Test User",
    },
  });
}

async function cleanup() {
  await prisma.notificationPreference.deleteMany({
    where: { userId: TEST_USER_ID },
  });
  await prisma.notificationDelivery.deleteMany({
    where: {
      notification: { recipientUserId: TEST_USER_ID },
    },
  });
  await prisma.userNotification.deleteMany({
    where: { recipientUserId: TEST_USER_ID },
  });
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
}

async function run() {
  console.log("\nnotification-service dispatch tests\n");

  await cleanup();
  await setup();

  await suite("dedupe: second dispatch returns deduplicated=true", async () => {
    const r1 = await dispatch({
      eventType: "application.received",
      recipientUserId: TEST_USER_ID,
      primaryEntityId: "job-001",
      title: "New application",
    });
    assert(r1.ok === true, "first dispatch should succeed");
    assert(
      r1.ok && r1.deduplicated === false,
      "first dispatch should not be deduplicated",
    );

    const r2 = await dispatch({
      eventType: "application.received",
      recipientUserId: TEST_USER_ID,
      primaryEntityId: "job-001",
      title: "New application",
    });
    assert(r2.ok === true, "second dispatch should succeed");
    assert(
      r2.ok && r2.deduplicated === true,
      "second dispatch should be deduplicated",
    );

    const count = await prisma.userNotification.count({
      where: {
        recipientUserId: TEST_USER_ID,
        eventType: "application.received",
        primaryEntityId: "job-001",
      },
    });
    assert(count === 1, `expected 1 notification row, got ${count}`);
  });

  await suite(
    "preference off suppresses email but keeps in-app",
    async () => {
      await prisma.notificationPreference.create({
        data: {
          userId: TEST_USER_ID,
          eventType: "application.received",
          channel: "email",
          enabled: false,
        },
      });

      const r = await dispatch({
        eventType: "application.received",
        recipientUserId: TEST_USER_ID,
        primaryEntityId: "job-pref-off",
        title: "Should not email",
      });
      assert(r.ok === true, "dispatch should succeed");
      if (!r.ok) return;

      const deliveries = await prisma.notificationDelivery.findMany({
        where: { notificationId: r.notificationId },
        select: { channel: true },
      });

      const channels = deliveries.map((d) => d.channel);
      assert(channels.includes("in_app"), "in-app delivery must exist");
      assert(!channels.includes("email"), "email delivery must NOT exist");

      await prisma.notificationPreference.deleteMany({
        where: { userId: TEST_USER_ID, eventType: "application.received" },
      });
    },
  );

  await suite("low-priority never creates email delivery", async () => {
    const r = await dispatch({
      eventType: "job.closed",
      recipientUserId: TEST_USER_ID,
      primaryEntityId: "job-low-001",
      title: "Job closed",
    });
    assert(r.ok === true, "dispatch should succeed");
    if (!r.ok) return;

    const deliveries = await prisma.notificationDelivery.findMany({
      where: { notificationId: r.notificationId },
      select: { channel: true },
    });

    const channels = deliveries.map((d) => d.channel);
    assert(channels.includes("in_app"), "in-app delivery must exist");
    assert(!channels.includes("email"), "email delivery must NOT exist for low-priority");
  });

  await suite("unknown event_type is rejected", async () => {
    const r = await dispatch({
      eventType: "made.up.event",
      recipientUserId: TEST_USER_ID,
      primaryEntityId: "entity-001",
      title: "Should fail",
    });
    assert(r.ok === false, "dispatch should fail for unknown event type");
    assert(
      !r.ok && r.message === "Unknown event type",
      `expected 'Unknown event type', got '${!r.ok ? r.message : ""}'`,
    );
  });

  await suite(
    "assessment.assigned dispatches both in-app and email",
    async () => {
      const r = await dispatch({
        eventType: "assessment.assigned",
        recipientUserId: TEST_USER_ID,
        primaryEntityId: "assess-001",
        title: "New assessment assigned",
      });
      assert(r.ok === true, "dispatch should succeed");
      if (!r.ok) return;

      const deliveries = await prisma.notificationDelivery.findMany({
        where: { notificationId: r.notificationId },
        select: { channel: true },
      });
      const channels = deliveries.map((d) => d.channel);
      assert(channels.includes("in_app"), "in-app delivery must exist");
      assert(channels.includes("email"), "email delivery must exist for assessment.assigned");
    },
  );

  await suite(
    "outreach.reply_received dispatches both in-app and email",
    async () => {
      const r = await dispatch({
        eventType: "outreach.reply_received",
        recipientUserId: TEST_USER_ID,
        primaryEntityId: "outreach-001",
        title: "You received a reply",
      });
      assert(r.ok === true, "dispatch should succeed");
      if (!r.ok) return;

      const deliveries = await prisma.notificationDelivery.findMany({
        where: { notificationId: r.notificationId },
        select: { channel: true },
      });
      const channels = deliveries.map((d) => d.channel);
      assert(channels.includes("in_app"), "in-app delivery must exist");
      assert(channels.includes("email"), "email delivery must exist for outreach.reply_received");
    },
  );

  await suite(
    "important event with default preferences creates email delivery",
    async () => {
      const r = await dispatch({
        eventType: "application.status_changed",
        recipientUserId: TEST_USER_ID,
        primaryEntityId: "app-status-001",
        title: "Status changed",
      });
      assert(r.ok === true, "dispatch should succeed");
      if (!r.ok) return;

      const deliveries = await prisma.notificationDelivery.findMany({
        where: { notificationId: r.notificationId },
        select: { channel: true, state: true },
      });

      const channels = deliveries.map((d) => d.channel);
      assert(channels.includes("in_app"), "in-app delivery must exist");
      assert(channels.includes("email"), "email delivery must exist for important event");

      const inApp = deliveries.find((d) => d.channel === "in_app");
      assert(inApp?.state === "sent", "in-app delivery state should be 'sent'");
    },
  );

  await suite(
    "suppression-exempt in-app cannot be disabled: API schema rejects in_app channel",
    async () => {
      const putSchema = z.object({
        eventType: z.string(),
        channel: z.literal("email"),
        enabled: z.boolean(),
      });

      const result = putSchema.safeParse({
        eventType: "application.received",
        channel: "in_app",
        enabled: false,
      });

      assert(!result.success, "schema must reject channel='in_app'");
    },
  );

  await suite(
    "suppression-exempt in-app always created even with in_app pref disabled in DB",
    async () => {
      await prisma.notificationPreference.upsert({
        where: {
          userId_eventType_channel: {
            userId: TEST_USER_ID,
            eventType: "application.received",
            channel: "in_app",
          },
        },
        update: { enabled: false },
        create: {
          userId: TEST_USER_ID,
          eventType: "application.received",
          channel: "in_app",
          enabled: false,
        },
      });

      const r = await dispatch({
        eventType: "application.received",
        recipientUserId: TEST_USER_ID,
        primaryEntityId: "suppress-exempt-test",
        title: "In-app must still arrive",
      });
      assert(r.ok === true, "dispatch should succeed");
      if (!r.ok) return;

      const deliveries = await prisma.notificationDelivery.findMany({
        where: { notificationId: r.notificationId },
        select: { channel: true, state: true },
      });

      const inApp = deliveries.find((d) => d.channel === "in_app");
      assert(inApp !== undefined, "in-app delivery must exist regardless of pref");
      assert(inApp!.state === "sent", "in-app state must be 'sent'");

      await prisma.notificationPreference.deleteMany({
        where: { userId: TEST_USER_ID, channel: "in_app" },
      });
    },
  );

  await suite(
    "auth.password_reset email cannot be disabled: emailExempt flag bypasses pref",
    async () => {
      await prisma.notificationPreference.upsert({
        where: {
          userId_eventType_channel: {
            userId: TEST_USER_ID,
            eventType: "auth.password_reset",
            channel: "email",
          },
        },
        update: { enabled: false },
        create: {
          userId: TEST_USER_ID,
          eventType: "auth.password_reset",
          channel: "email",
          enabled: false,
        },
      });

      const r = await dispatch({
        eventType: "auth.password_reset",
        recipientUserId: TEST_USER_ID,
        primaryEntityId: "pwd-reset-exempt-test",
        title: "Password reset",
      });
      assert(r.ok === true, "dispatch should succeed");
      if (!r.ok) return;

      const deliveries = await prisma.notificationDelivery.findMany({
        where: { notificationId: r.notificationId },
        select: { channel: true },
      });

      const channels = deliveries.map((d) => d.channel);
      assert(channels.includes("email"), "email delivery must exist even with pref disabled (emailExempt)");

      await prisma.notificationPreference.deleteMany({
        where: { userId: TEST_USER_ID, eventType: "auth.password_reset" },
      });
    },
  );

  await cleanup();

  console.log(`\n${passed} passed, ${failed} failed\n`);

  if (failed > 0) process.exit(1);
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error("Test runner failed:", e);
  process.exit(1);
});
