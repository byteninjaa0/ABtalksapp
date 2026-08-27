import { CertificateType, Domain } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  CERTIFICATE_LAYOUTS,
  CERTIFICATE_TEMPLATES,
  CERTIFICATE_TYPES,
  CERT_ID_ALPHABET,
  CERT_ID_PATTERN,
  HACKATHON_VARIANT_FILE_SLUGS,
  HACKATHON_VARIANT_LABELS,
  HACKATHON_VARIANT_TEMPLATES,
  certificateDomainLabel,
  certificateTypeFromCredentialTitle,
  domainForCertificateType,
  parseHackathonVariant,
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

describe("hackathon placement variants", () => {
  it("parses only known award variants", () => {
    expect(parseHackathonVariant("winner")).toBe("winner");
    expect(parseHackathonVariant("second")).toBe("second");
    expect(parseHackathonVariant("third")).toBe("third");
    expect(parseHackathonVariant("top5")).toBe("top5");
    expect(parseHackathonVariant("participation")).toBeNull();
    expect(parseHackathonVariant(null)).toBeNull();
    expect(parseHackathonVariant(1)).toBeNull();
  });

  it("maps each variant to a distinct PDF path, label, and file slug", () => {
    expect(HACKATHON_VARIANT_TEMPLATES.winner).toContain("winner-vicod-aug.pdf");
    expect(HACKATHON_VARIANT_TEMPLATES.top5).toContain("top5-vicod-aug.pdf");
    expect(HACKATHON_VARIANT_LABELS).toEqual({
      winner: "Winner",
      second: "2nd place",
      third: "3rd place",
      top5: "Top 5",
    });
    expect(HACKATHON_VARIANT_FILE_SLUGS.second).toBe("2nd");
    expect(HACKATHON_VARIANT_FILE_SLUGS.third).toBe("3rd");
  });
});

describe("credential title ↔ certificate type", () => {
  it("accepts Phase 2g CertificateType titles only", () => {
    expect(certificateTypeFromCredentialTitle("HACKATHON")).toBe(
      CertificateType.HACKATHON,
    );
    expect(certificateTypeFromCredentialTitle("CLAUDE_CHALLENGE")).toBe(
      CertificateType.CLAUDE_CHALLENGE,
    );
    expect(certificateTypeFromCredentialTitle("ViCoDathon 2026")).toBeNull();
    expect(certificateTypeFromCredentialTitle("")).toBeNull();
  });

  it("derives Claude domain for challenge certs and null otherwise", () => {
    expect(domainForCertificateType(CertificateType.CLAUDE_CHALLENGE)).toBe(
      Domain.CLAUDE,
    );
    expect(domainForCertificateType(CertificateType.HACKATHON)).toBeNull();
  });
});
