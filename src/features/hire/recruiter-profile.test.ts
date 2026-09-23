/**
 * T-227 — Recruiter Profile & Company Identity.
 *
 * A recruiter can view and edit their own profile (full name, phone) and
 * company identity (company name, website, industry, size, location).
 * Changes persist in the database and are strictly isolated per recruiter workspace.
 *
 * Run: npm run test:recruiter-profile
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  updateRecruiterProfileSchema,
} from "@/lib/validations/recruiter-profile";

let passed = 0;
let failed = 0;

function assert(cond: boolean | undefined, msg: string) {
  if (!cond) throw new Error(msg);
}

function suite(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n      ${(e as Error).message}`);
  }
}

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

console.log("\nT-227 recruiter profile & company identity");

// =========================================================================
// 1. Schema & Validation Tests
// =========================================================================

suite("valid full profile input passes Zod parsing", () => {
  const input = {
    fullName: "  Jane Recruiter  ",
    phone: "+1 555-0199",
    companyName: "Acme Technologies",
    website: "https://acme.example.com",
    industry: "Enterprise SaaS",
    companySize: "50-200",
    location: "San Francisco, CA",
  };
  const parsed = updateRecruiterProfileSchema.safeParse(input);
  assert(parsed.success, "valid input must parse successfully");
  if (parsed.success) {
    assert(parsed.data.fullName === "Jane Recruiter", "fullName must be trimmed");
    assert(parsed.data.phone === "+1 555-0199", "phone must match");
    assert(parsed.data.companyName === "Acme Technologies", "companyName must match");
    assert(parsed.data.website === "https://acme.example.com", "website must match");
    assert(parsed.data.industry === "Enterprise SaaS", "industry must match");
    assert(parsed.data.companySize === "50-200", "companySize must match");
    assert(parsed.data.location === "San Francisco, CA", "location must match");
  }
});

suite("minimal input with only name and company passes and converts empties to null", () => {
  const input = {
    fullName: "Alice Smith",
    phone: "",
    companyName: "Hiring Corp",
    website: "",
    industry: "   ",
    companySize: null,
    location: undefined,
  };
  const parsed = updateRecruiterProfileSchema.safeParse(input);
  assert(parsed.success, "minimal input must succeed");
  if (parsed.success) {
    assert(parsed.data.fullName === "Alice Smith", "name preserved");
    assert(parsed.data.phone === null, "empty phone converted to null");
    assert(parsed.data.website === null, "empty website converted to null");
    assert(parsed.data.industry === null, "whitespace industry converted to null");
    assert(parsed.data.companySize === null, "null companySize converted to null");
    assert(parsed.data.location === null, "undefined location converted to null");
  }
});

suite("website without protocol is auto-prefixed with https://", () => {
  const input = {
    fullName: "Bob Recruiter",
    companyName: "TechWorks",
    website: "techworks.io",
  };
  const parsed = updateRecruiterProfileSchema.safeParse(input);
  assert(parsed.success, "bare domain website should parse");
  if (parsed.success) {
    assert(parsed.data.website === "https://techworks.io", "should prepend https://");
  }
});

suite("invalid website string is rejected", () => {
  const input = {
    fullName: "Bob Recruiter",
    companyName: "TechWorks",
    website: "not a valid url @@@",
  };
  const parsed = updateRecruiterProfileSchema.safeParse(input);
  assert(!parsed.success, "malformed website must fail");
});

suite("invalid phone format or letters is rejected", () => {
  const input = {
    fullName: "Bob Recruiter",
    companyName: "TechWorks",
    phone: "call-me-maybe-1234",
  };
  const parsed = updateRecruiterProfileSchema.safeParse(input);
  assert(!parsed.success, "phone with letters must fail");
});

suite("phone with arbitrary characters like = and letters (e.g. 12324u5i855=357ui3) is rejected", () => {
  const input = {
    fullName: "Bob Recruiter",
    companyName: "TechWorks",
    phone: "12324u5i855=357ui3",
  };
  const parsed = updateRecruiterProfileSchema.safeParse(input);
  assert(!parsed.success, "phone with = and letters must fail");
});

suite("phone under 7 digits or formatting only is rejected", () => {
  const inputTooShort = {
    fullName: "Bob Recruiter",
    companyName: "TechWorks",
    phone: "12345",
  };
  assert(!updateRecruiterProfileSchema.safeParse(inputTooShort).success, "5 digit phone must fail");

  const inputSymbolsOnly = {
    fullName: "Bob Recruiter",
    companyName: "TechWorks",
    phone: "(---)----",
  };
  assert(!updateRecruiterProfileSchema.safeParse(inputSymbolsOnly).success, "symbols only must fail");
});

suite("valid formatted international phone numbers are accepted", () => {
  const validNumbers = [
    "+1 555-0199",
    "+91 98765 43210",
    "(555) 123-4567",
    "+44 20 7946 0991",
    "9876543210",
  ];
  for (const phone of validNumbers) {
    const input = {
      fullName: "Bob Recruiter",
      companyName: "TechWorks",
      phone,
    };
    const parsed = updateRecruiterProfileSchema.safeParse(input);
    assert(parsed.success, `phone "${phone}" should be accepted`);
  }
});

suite("phone exceeding 25 characters is rejected", () => {
  const input = {
    fullName: "Bob Recruiter",
    companyName: "TechWorks",
    phone: "+1 23456789012345678901234567",
  };
  const parsed = updateRecruiterProfileSchema.safeParse(input);
  assert(!parsed.success, "phone > 25 chars must fail");
});

suite("short or empty full name is rejected", () => {
  const input = {
    fullName: "A",
    companyName: "TechWorks",
  };
  const parsed = updateRecruiterProfileSchema.safeParse(input);
  assert(!parsed.success, "single char name must fail");
});

suite("short or empty company name is rejected", () => {
  const input = {
    fullName: "Valid Name",
    companyName: " ",
  };
  const parsed = updateRecruiterProfileSchema.safeParse(input);
  assert(!parsed.success, "empty company name must fail");
});

// =========================================================================
// 2. Database Schema & Migration Assertions
// =========================================================================

suite("Organization model in schema.prisma has location column", () => {
  const schema = source("prisma/schema.prisma");
  assert(
    schema.includes("model Organization {") && schema.includes("location   String?"),
    "Organization model must include location String?",
  );
});

suite("migration exists for Organization location column", () => {
  const migrationPath =
    "prisma/migrations/20260911230000_organization_location/migration.sql";
  assert(existsSync(join(process.cwd(), migrationPath)), "migration file must exist");
  const sql = source(migrationPath);
  assert(
    sql.includes('ALTER TABLE "Organization" ADD COLUMN "location" TEXT;'),
    "migration must add location column to Organization",
  );
});

// =========================================================================
// 3. Security, Workspace Boundary & Isolation Source Scans
// =========================================================================

suite("getRecruiterProfileAction resolves workspace from session with requireRecruiterWorkspace", () => {
  const src = source("src/app/actions/recruiter-profile-actions.ts");
  assert(
    src.includes("requireRecruiterWorkspace"),
    "must call requireRecruiterWorkspace",
  );
  assert(
    src.includes("export async function getRecruiterProfileAction():"),
    "must take no client arguments",
  );
});

suite("updateRecruiterProfileAction takes no caller-supplied user or org IDs", () => {
  const src = source("src/app/actions/recruiter-profile-actions.ts");
  assert(
    !src.includes("input.userId") &&
      !src.includes("input.organizationId") &&
      !src.includes("input.recruiterProfileId"),
    "must never accept caller-supplied user or org IDs",
  );
  assert(
    src.includes("workspace.data") &&
      src.includes("recruiterProfileId") &&
      src.includes("organizationId"),
    "must use server-resolved workspace IDs",
  );
});

suite("updateRecruiterProfileAction atomically updates RecruiterProfile and Organization in a transaction", () => {
  const src = source("src/app/actions/recruiter-profile-actions.ts");
  assert(
    src.includes("prisma.$transaction"),
    "updates must occur within a transaction",
  );
  assert(
    src.includes("tx.recruiterProfile.update") &&
      src.includes("tx.organization.update"),
    "both RecruiterProfile and Organization must be updated",
  );
  assert(
    src.includes("company: data.companyName") &&
      src.includes("name: data.companyName"),
    "RecruiterProfile.company and Organization.name must be kept synchronized",
  );
  assert(
    src.includes("location: data.location"),
    "Organization.location must be updated",
  );
});

suite("profile page requires recruiter authentication", () => {
  const src = source("src/app/hire/profile/page.tsx");
  assert(
    src.includes("requireRecruiter"),
    "profile page must call requireRecruiter()",
  );
  assert(
    src.includes("RecruiterProfileForm"),
    "profile page must render RecruiterProfileForm",
  );
});

suite("sidebar account row opens the recruiter profile", () => {
  const src = source("src/components/hire/hire-sidebar.tsx");
  assert(
    src.includes('href="/hire/profile"'),
    "sidebar account row must link to /hire/profile",
  );
  assert(
    !src.includes('href="/hire/settings"'),
    "sidebar must not link to the retired /hire/settings",
  );
});

suite("old /hire/settings URL still resolves", () => {
  const src = source("next.config.ts");
  assert(
    src.includes('source: "/hire/settings"') &&
      src.includes('destination: "/hire/profile"'),
    "next.config must redirect /hire/settings to /hire/profile",
  );
});

// =========================================================================
// Summary
// =========================================================================

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
