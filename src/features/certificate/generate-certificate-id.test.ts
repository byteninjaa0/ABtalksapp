import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
const randomInt = vi.hoisted(() => vi.fn());
const loggerError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    certificate: { findUnique },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: loggerError, info: vi.fn(), warn: vi.fn() },
}));

vi.mock("node:crypto", async () => {
  const actual = await vi.importActual<typeof import("node:crypto")>("node:crypto");
  return {
    ...actual,
    randomInt,
  };
});

import { CertificateType } from "@prisma/client";
import { generateCertificateId } from "@/features/certificate/generate-certificate-id";
import { CERT_ID_ALPHABET, CERT_ID_LENGTH } from "@/features/certificate/constants";

beforeEach(() => {
  vi.clearAllMocks();
  // Always pick the first alphabet character for deterministic IDs.
  randomInt.mockReturnValue(0);
});

describe("generateCertificateId", () => {
  it("returns ABT-<code>-<suffix> when the first candidate is free", async () => {
    findUnique.mockResolvedValue(null);

    const id = await generateCertificateId(CertificateType.HACKATHON);
    const suffix = CERT_ID_ALPHABET[0]!.repeat(CERT_ID_LENGTH);
    expect(id).toBe(`ABT-HK-${suffix}`);
    expect(findUnique).toHaveBeenCalledOnce();
  });

  it("retries on collisions and throws after 6 exhausted attempts", async () => {
    findUnique.mockResolvedValue({ id: "existing" });

    await expect(
      generateCertificateId(CertificateType.CLAUDE_CHALLENGE),
    ).rejects.toThrow(/unique certificate ID/);
    expect(findUnique).toHaveBeenCalledTimes(6);
    expect(loggerError).toHaveBeenCalledOnce();
  });
});
