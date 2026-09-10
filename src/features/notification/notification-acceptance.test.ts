/**
 * TC-S-005 acceptance tests — run with:
 *   npm run test:notification-acceptance
 * or:
 *   cross-env NODE_OPTIONS=--conditions=react-server npx tsx src/features/notification/notification-acceptance.test.ts
 *
 * Four acceptance criteria for the notification service.
 * Requires a database connection (real Prisma queries, no mocks).
 */
import { prisma } from "@/lib/db";
import { dispatch } from "./notification-service";
import { processEmailDelivery } from "./email-delivery";

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

const TEST_USER_ID = "test-acceptance-notif-user";
const TEST_EMAIL = "acceptance-test@abtalks.dev";

async function setup() {
  await prisma.user.upsert({
    where: { id: TEST_USER_ID },
    update: {},
    create: {
      id: TEST_USER_ID,
      email: TEST_EMAIL,
      name: "Acceptance Test User",
    },
  });
}

async function cleanup() {
  await prisma.notificationPreference.deleteMany({
    where: { userId: TEST_USER_ID },
  });
  await prisma.notificationDelivery.deleteMany({
    where: { notification: { recipientUserId: TEST_USER_ID } },
  });
  await prisma.userNotification.deleteMany({
    where: { recipientUserId: TEST_USER_ID },
  });
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
}

async function run() {
  console.log("\nTC-S-005 acceptance tests\n");

  await cleanup();
  await setup();

  await suite(
    "TC-S-005-01: deduplicates on repeat dispatch",
    async () => {
      const r1 = await dispatch({
        eventType: "application.received",
        recipientUserId: TEST_USER_ID,
        primaryEntityId: "accept-dedup-1",
        title: "New application from Alice",
      });
      assert(r1.ok === true, "first dispatch must succeed");
      assert(r1.ok && !r1.deduplicated, "first must not be deduplicated");

      const r2 = await dispatch({
        eventType: "application.received",
        recipientUserId: TEST_USER_ID,
        primaryEntityId: "accept-dedup-1",
        title: "New application from Alice",
      });
      assert(r2.ok === true, "second dispatch must succeed");
      assert(r2.ok && r2.deduplicated, "second must be deduplicated");

      const notifCount = await prisma.userNotification.count({
        where: {
          recipientUserId: TEST_USER_ID,
          primaryEntityId: "accept-dedup-1",
        },
      });
      assert(notifCount === 1, `expected 1 notification, got ${notifCount}`);

      const deliveryCount = await prisma.notificationDelivery.count({
        where: {
          notification: {
            recipientUserId: TEST_USER_ID,
            primaryEntityId: "accept-dedup-1",
          },
          channel: "in_app",
        },
      });
      assert(deliveryCount === 1, `expected 1 in-app delivery, got ${deliveryCount}`);
    },
  );

  await suite(
    "TC-S-005-02: persists failure state and reason",
    async () => {
      const r = await dispatch({
        eventType: "application.status_changed",
        recipientUserId: TEST_USER_ID,
        primaryEntityId: "accept-fail-1",
        title: "Application status changed",
      });
      assert(r.ok === true, "dispatch must succeed");
      if (!r.ok) return;

      const emailDelivery = await prisma.notificationDelivery.findFirst({
        where: {
          notificationId: r.notificationId,
          channel: "email",
        },
        select: { state: true, failureReason: true, attemptCount: true },
      });

      assert(emailDelivery !== null, "email delivery row must exist");
      assert(
        emailDelivery!.state === "failed",
        `state should be 'failed', got '${emailDelivery!.state}'`,
      );
      assert(
        emailDelivery!.failureReason !== null &&
          emailDelivery!.failureReason.length > 0,
        "failureReason must be set",
      );
      assert(
        emailDelivery!.attemptCount === 1,
        `attemptCount should be 1, got ${emailDelivery!.attemptCount}`,
      );
    },
  );

  await suite(
    "TC-S-005-03: respects preferences (email disabled, in-app still created)",
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
        primaryEntityId: "accept-pref-1",
        title: "New application (pref disabled)",
      });
      assert(r.ok === true, "dispatch must succeed");
      if (!r.ok) return;

      const deliveries = await prisma.notificationDelivery.findMany({
        where: { notificationId: r.notificationId },
        select: { channel: true, state: true },
      });

      const channels = deliveries.map((d) => d.channel);
      assert(channels.includes("in_app"), "in-app delivery must exist");
      assert(!channels.includes("email"), "email delivery must NOT exist when preference is off");

      const inApp = deliveries.find((d) => d.channel === "in_app");
      assert(inApp?.state === "sent", "in-app state must be 'sent'");

      await prisma.notificationPreference.deleteMany({
        where: { userId: TEST_USER_ID },
      });
    },
  );

  await suite(
    "TC-S-005-04: idempotent under retry (sent delivery not re-claimed)",
    async () => {
      const notif = await prisma.userNotification.create({
        data: {
          recipientUserId: TEST_USER_ID,
          eventType: "application.received",
          title: "Idempotency test",
          dedupeKey: `application.received:${TEST_USER_ID}:accept-idempotent-1`,
          primaryEntityId: "accept-idempotent-1",
        },
        select: { id: true },
      });

      const delivery = await prisma.notificationDelivery.create({
        data: {
          notificationId: notif.id,
          channel: "email",
          state: "created",
        },
        select: { id: true },
      });

      await processEmailDelivery(delivery.id);

      const afterFirst = await prisma.notificationDelivery.findUnique({
        where: { id: delivery.id },
        select: { state: true, attemptCount: true },
      });
      assert(afterFirst !== null, "delivery must exist after first call");

      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { state: "sent" },
      });

      await processEmailDelivery(delivery.id);

      const afterSecond = await prisma.notificationDelivery.findUnique({
        where: { id: delivery.id },
        select: { state: true, attemptCount: true },
      });

      assert(afterSecond!.state === "sent", "state must still be 'sent'");
      assert(
        afterSecond!.attemptCount === afterFirst!.attemptCount,
        `attemptCount must not change (expected ${afterFirst!.attemptCount}, got ${afterSecond!.attemptCount})`,
      );
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
