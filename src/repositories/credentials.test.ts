import { CertificateStatus, CertificateType } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueCredential = vi.hoisted(() => vi.fn());
const findManyCredential = vi.hoisted(() => vi.fn());
const findUniqueCertificate = vi.hoisted(() => vi.fn());
const findManyCertificate = vi.hoisted(() => vi.fn());
const isNewCredentialRepoEnabled = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    credential: {
      findUnique: findUniqueCredential,
      findMany: findManyCredential,
    },
    certificate: {
      findUnique: findUniqueCertificate,
      findMany: findManyCertificate,
    },
  },
}));

vi.mock("@/lib/feature-flags", () => ({
  isNewCredentialRepoEnabled,
}));

import { getByPublicId, listForUser } from "@/repositories/credentials";

beforeEach(() => {
  vi.clearAllMocks();
  isNewCredentialRepoEnabled.mockReturnValue(false);
});

afterEach(() => {
  isNewCredentialRepoEnabled.mockReturnValue(false);
});

describe("getByPublicId", () => {
  it("maps legacy Certificate rows into CredentialView when flag is off", async () => {
    const issuedAt = new Date("2026-08-09T12:00:00Z");
    findUniqueCertificate.mockResolvedValue({
      certificateId: "ABT-HK-W2N3R",
      userId: "user_1",
      type: CertificateType.HACKATHON,
      recipientName: "Ada",
      status: CertificateStatus.ISSUED,
      issuedAt,
      metadata: { teamName: "Team Ada" },
    });

    await expect(getByPublicId("ABT-HK-W2N3R")).resolves.toEqual({
      credentialId: "ABT-HK-W2N3R",
      userId: "user_1",
      type: CertificateType.HACKATHON,
      title: CertificateType.HACKATHON,
      recipientName: "Ada",
      status: CertificateStatus.ISSUED,
      issuedAt,
      metadata: { teamName: "Team Ada" },
    });
    expect(findUniqueCertificate).toHaveBeenCalledWith({
      where: { certificateId: "ABT-HK-W2N3R" },
      select: expect.objectContaining({
        certificateId: true,
        type: true,
        metadata: true,
      }),
    });
    expect(findUniqueCredential).not.toHaveBeenCalled();
  });

  it("returns null when the legacy certificate is missing", async () => {
    findUniqueCertificate.mockResolvedValue(null);
    await expect(getByPublicId("ABT-HK-W2N3R")).resolves.toBeNull();
  });

  it("reads Credential directly when ENABLE_NEW_CREDENTIAL is on", async () => {
    isNewCredentialRepoEnabled.mockReturnValue(true);
    const issuedAt = new Date("2026-08-09T12:00:00Z");
    const row = {
      credentialId: "ABT-CC-W2N3R",
      userId: "user_1",
      type: "COMPLETION",
      title: CertificateType.CLAUDE_CHALLENGE,
      recipientName: "Claude Grad",
      status: CertificateStatus.ISSUED,
      issuedAt,
      metadata: { daysCompleted: 60 },
    };
    findUniqueCredential.mockResolvedValue(row);

    await expect(getByPublicId("ABT-CC-W2N3R")).resolves.toEqual(row);
    expect(findUniqueCredential).toHaveBeenCalledWith({
      where: { credentialId: "ABT-CC-W2N3R" },
      select: expect.objectContaining({
        credentialId: true,
        title: true,
      }),
    });
    expect(findUniqueCertificate).not.toHaveBeenCalled();
  });
});

describe("listForUser", () => {
  it("maps legacy certificates and preserves issuedAt/public-id ordering", async () => {
    const issuedAt = new Date("2026-08-09T12:00:00Z");
    findManyCertificate.mockResolvedValue([
      {
        certificateId: "ABT-HK-W2N3R",
        userId: "user_1",
        type: CertificateType.HACKATHON,
        recipientName: "Ada",
        status: CertificateStatus.ISSUED,
        issuedAt,
        metadata: {},
      },
    ]);

    await expect(listForUser("user_1")).resolves.toEqual([
      {
        credentialId: "ABT-HK-W2N3R",
        userId: "user_1",
        type: CertificateType.HACKATHON,
        title: CertificateType.HACKATHON,
        recipientName: "Ada",
        status: CertificateStatus.ISSUED,
        issuedAt,
        metadata: {},
      },
    ]);
    expect(findManyCertificate).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      orderBy: [{ issuedAt: "desc" }, { certificateId: "asc" }],
      select: expect.any(Object),
    });
  });

  it("lists Credential rows when ENABLE_NEW_CREDENTIAL is on", async () => {
    isNewCredentialRepoEnabled.mockReturnValue(true);
    findManyCredential.mockResolvedValue([]);

    await expect(listForUser("user_1")).resolves.toEqual([]);
    expect(findManyCredential).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      orderBy: [{ issuedAt: "desc" }, { credentialId: "asc" }],
      select: expect.any(Object),
    });
    expect(findManyCertificate).not.toHaveBeenCalled();
  });
});
