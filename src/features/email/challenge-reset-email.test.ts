import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const warn = vi.hoisted(() => vi.fn());
const info = vi.hoisted(() => vi.fn());
const error = vi.hoisted(() => vi.fn());
const sendTransacEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/logger", () => ({
  logger: { warn, info, error },
}));

vi.mock("@getbrevo/brevo", () => ({
  BrevoClient: class {
    transactionalEmails = { sendTransacEmail };
    constructor(_opts: { apiKey: string }) {}
  },
}));

import {
  challengeResetEmail,
  sendChallengeResetEmail,
} from "@/features/email/challenge-reset-email";

describe("challengeResetEmail", () => {
  it("builds subject, text, and html with the dashboard CTA", () => {
    const built = challengeResetEmail({
      firstName: "Ada",
      dashboardUrl: "https://abtalks.in/dashboard",
    });

    expect(built.subject).toContain("Challenge Reset");
    expect(built.text).toContain("Ada");
    expect(built.text).toContain("https://abtalks.in/dashboard");
    expect(built.html).toContain("https://abtalks.in/dashboard");
    expect(built.html).toContain("Login to Dashboard");
  });
});

describe("sendChallengeResetEmail guards", () => {
  const prevKey = process.env.BREVO_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    sendTransacEmail.mockResolvedValue({});
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env.BREVO_API_KEY;
    else process.env.BREVO_API_KEY = prevKey;
  });

  it("skips send when BREVO_API_KEY is missing", async () => {
    delete process.env.BREVO_API_KEY;

    await sendChallengeResetEmail({
      to: "student@example.com",
      firstName: "Ada",
      dashboardUrl: "https://abtalks.in/dashboard",
    });

    expect(warn).toHaveBeenCalled();
    expect(sendTransacEmail).not.toHaveBeenCalled();
  });

  it("skips seed/test @abtalks.dev addresses to protect domain reputation", async () => {
    process.env.BREVO_API_KEY = "test-key";

    await sendChallengeResetEmail({
      to: "seed.user@abtalks.dev",
      firstName: "Seed",
      dashboardUrl: "https://abtalks.in/dashboard",
    });

    expect(info).toHaveBeenCalled();
    expect(sendTransacEmail).not.toHaveBeenCalled();
  });

  it("sends via Brevo for real addresses when API key is set", async () => {
    process.env.BREVO_API_KEY = "test-key";

    await sendChallengeResetEmail({
      to: "student@example.com",
      firstName: "Ada",
      dashboardUrl: "https://abtalks.in/dashboard",
    });

    expect(sendTransacEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: [{ email: "student@example.com", name: "Ada" }],
        subject: expect.stringContaining("Challenge Reset"),
      }),
    );
  });
});
