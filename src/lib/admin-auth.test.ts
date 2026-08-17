import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

import { auth } from "@/auth";
import { getAdminContext, isAdminEmail, requireAdmin } from "@/lib/admin-auth";

const authMock = vi.mocked(auth);

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.ADMIN_EMAILS;
});

describe("isAdminEmail", () => {
  it("matches trimmed, case-insensitive ADMIN_EMAILS entries", async () => {
    process.env.ADMIN_EMAILS = " Admin@Example.com , other@x.com ";
    await expect(isAdminEmail("admin@example.com")).resolves.toBe(true);
    await expect(isAdminEmail("OTHER@X.COM")).resolves.toBe(true);
  });

  it("returns false for missing email or non-admins", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    await expect(isAdminEmail(null)).resolves.toBe(false);
    await expect(isAdminEmail(undefined)).resolves.toBe(false);
    await expect(isAdminEmail("student@example.com")).resolves.toBe(false);
  });

  it("returns false when ADMIN_EMAILS is empty", async () => {
    process.env.ADMIN_EMAILS = "";
    await expect(isAdminEmail("admin@example.com")).resolves.toBe(false);
  });
});

describe("requireAdmin / getAdminContext", () => {
  it("requireAdmin redirects unauthenticated users to login", async () => {
    authMock.mockResolvedValue(null as never);
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/login");
  });

  it("requireAdmin redirects non-admins to dashboard", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    authMock.mockResolvedValue({
      user: { id: "u1", email: "student@example.com", name: "Stu" },
    } as never);
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("getAdminContext returns null for non-admins and a context for admins", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    authMock.mockResolvedValue({
      user: { id: "u1", email: "student@example.com", name: "Stu" },
    } as never);
    await expect(getAdminContext()).resolves.toBeNull();

    authMock.mockResolvedValue({
      user: { id: "a1", email: "Admin@Example.com", name: "Ada" },
    } as never);
    await expect(getAdminContext()).resolves.toEqual({
      userId: "a1",
      email: "Admin@Example.com",
      name: "Ada",
    });
  });
});
