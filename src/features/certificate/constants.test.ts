import { CertificateType, Domain } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  CERTIFICATE_LAYOUTS,
  CERTIFICATE_TEMPLATES,
  CERTIFICATE_TYPES,
  CERT_ID_ALPHABET,
  CERT_ID_PATTERN,
  certificateDomainLabel,
} from "@/features/certificate/constants";

describe("certificate ID alphabet / pattern", () => {
  it("excludes ambiguous 0/O/1/I/L characters", () => {
    expect(CERT_ID_ALPHABET).not.toMatch(/[01ILO]/);
    expect(CERT_ID_PATTERN.test("ABT-HK-23456")).toBe(true);
    expect(CERT_ID_PATTERN.test("ABT-CC-ABCDE")).toBe(true);
    expect(CERT_ID_PATTERN.test("ABT-HK-01ILO")).toBe(false);
  });
});

describe("CERTIFICATE_TYPES", () => {
  it("maps hackathon to HK code and ViCoDathon file slug", () => {
    expect(CERTIFICATE_TYPES[CertificateType.HACKATHON]).toMatchObject({
      code: "HK",
      fileSlug: "ViCoDathon-2026",
      title: "ViCoDathon 2026",
    });
    expect(CERTIFICATE_TYPES[CertificateType.CLAUDE_CHALLENGE].code).toBe("CC");
  });
});

describe("CERTIFICATE_LAYOUTS / TEMPLATES", () => {
  it("keeps hackathon layout without verify URL and with per-type template envs", () => {
    expect(CERTIFICATE_LAYOUTS[CertificateType.HACKATHON]?.verifyText).toBeNull();
    expect(CERTIFICATE_LAYOUTS[CertificateType.CLAUDE_CHALLENGE]?.verifyText).not.toBeNull();

    expect(CERTIFICATE_TEMPLATES[CertificateType.HACKATHON]).toMatchObject({
      pathEnv: "HACKATHON_CERTIFICATE_TEMPLATE_PATH",
      urlEnv: "HACKATHON_CERTIFICATE_TEMPLATE_URL",
      defaultPath: "public/certificates/vicodathon-certificate.pdf",
    });
    expect(CERTIFICATE_TEMPLATES[CertificateType.CLAUDE_CHALLENGE]?.pathEnv).toBe(
      "CERTIFICATE_TEMPLATE_PATH",
    );
  });
});

describe("certificateDomainLabel", () => {
  it("labels known domains and falls back for null/unknown", () => {
    expect(certificateDomainLabel(Domain.CLAUDE)).toBe("Claude AI Mastery");
    expect(certificateDomainLabel(Domain.SE)).toBe("Software Engineering");
    expect(certificateDomainLabel(null)).toBe("—");
  });
});
