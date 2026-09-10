/**
 * Integration tests for email delivery — run with:
 *   npm run test:email-delivery
 * or:
 *   cross-env NODE_OPTIONS=--conditions=react-server npx tsx src/features/notification/email-delivery.test.ts
 *
 * Requires a database connection. Exercises the atomic claim pattern,
 * state transitions, and retry logic against real rows.
 */
import { prisma } from "@/lib/db";
import { processEmailDelivery, retryFailedDeliveries } from "./email-delivery";

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

const TEST_USER_ID = "test-email-delivery-user";
const TEST_EMAIL = "email-test@abtalks.dev";

async function setup() {
  await prisma.user.upsert({
    where: { id: TEST_USER_ID },
    update: {},
    create: {
      id: TEST_USER_ID,
      email: TEST_EMAIL,
      name: "Email Delivery Test User",
    },
  });
}

async function cleanup() {
  await prisma.notificationDelivery.deleteMany({
    where: { notification: { recipientUserId: TEST_USER_ID } },
  });
  await prisma.userNotification.deleteMany({
    where: { recipientUserId: TEST_USER_ID },
  });
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
}

async function createTestNotificationWithDelivery(
  primaryEntityId: string,
  state: string = "created",
) {
  const notif = await prisma.userNotification.create({
    data: {
      recipientUserId: TEST_USER_ID,
      eventType: "application.received",
      title: "Test notification",
      body: "Test body",
      href: "/test",
      dedupeKey: `application.received:${TEST_USER_ID}:${primaryEntityId}`,
      primaryEntityId,
    },
    select: { id: true },
  });

  const delivery = await prisma.notificationDelivery.create({
    data: {
      notificationId: notif.id,
      channel: "email",
      state,
    },
    select: { id: true },
  });

  return { notificationId: notif.id, deliveryId: delivery.id };
}

async function run() {
  console.log("\nemail-delivery integration tests\n");

  await cleanup();
  await setup();

  await suite("atomic claim transitions created → sending → sent/failed", async () => {
    const { deliveryId } = await createTestNotificationWithDelivery("claim-test-1");

    await processEmailDelivery(deliveryId);

    const after = await prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      select: { state: true, attemptCount: true, lastAttemptAt: true },
    });

    assert(after !== null, "delivery row should exist");
    assert(
      after!.state === "sent" || after!.state === "failed",
      `state should be sent or failed, got ${after!.state}`,
    );
    assert(after!.attemptCount === 1, `attemptCount should be 1, got ${after!.attemptCount}`);
    assert(after!.lastAttemptAt !== null, "lastAttemptAt should be set");
  });

  await suite("already-sent delivery is not re-claimed", async () => {
    const { deliveryId } = await createTestNotificationWithDelivery("claim-test-2");

    await processEmailDelivery(deliveryId);

    const afterFirst = await prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      select: { attemptCount: true },
    });

    await prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: { state: "sent" },
    });

    await processEmailDelivery(deliveryId);

    const afterSecond = await prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      select: { state: true, attemptCount: true },
    });

    assert(afterSecond!.state === "sent", "state should still be sent");
    assert(
      afterSecond!.attemptCount === afterFirst!.attemptCount,
      "attemptCount should not increase for already-sent delivery",
    );
  });

  await suite("retryFailedDeliveries processes eligible rows", async () => {
    const { deliveryId } = await createTestNotificationWithDelivery("retry-test-1");

    await prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        state: "failed",
        attemptCount: 1,
        lastAttemptAt: new Date(Date.now() - 10 * 60 * 1000),
        failureReason: "test failure",
      },
    });

    const result = await retryFailedDeliveries();

    assert(result.processed >= 1, `should process at least 1, got ${result.processed}`);

    const after = await prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      select: { state: true, attemptCount: true },
    });
    assert(after!.attemptCount === 2, `attemptCount should be 2, got ${after!.attemptCount}`);
  });

  await suite("retryFailedDeliveries skips rows within backoff window", async () => {
    const { deliveryId } = await createTestNotificationWithDelivery("retry-backoff-1");

    await prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        state: "failed",
        attemptCount: 3,
        lastAttemptAt: new Date(),
        failureReason: "test failure",
      },
    });

    const result = await retryFailedDeliveries();

    const after = await prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      select: { state: true, attemptCount: true },
    });
    assert(
      after!.attemptCount === 3,
      `attemptCount should still be 3 (skipped), got ${after!.attemptCount}`,
    );
  });

  await suite("retryFailedDeliveries respects max attempts", async () => {
    const { deliveryId } = await createTestNotificationWithDelivery("retry-max-1");

    await prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        state: "failed",
        attemptCount: 5,
        lastAttemptAt: new Date(Date.now() - 60 * 60 * 1000),
        failureReason: "exhausted",
      },
    });

    await retryFailedDeliveries();

    const after = await prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      select: { attemptCount: true },
    });
    assert(
      after!.attemptCount === 5,
      `attemptCount should still be 5 (max reached), got ${after!.attemptCount}`,
    );
  });

  await cleanup();

  console.log(`\n${passed} passed, ${failed} failed\n`);

  if (failed > 0) process.exit(1);
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error("Test runner failed:", e);
  process.exit(1);
});
