import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import {
  hasPreviewAccess,
  isLaunchOnePagerEnabled,
  isRecruiterAuthEnabled,
} from "@/lib/feature-flags";
import { ensurePreviewUser } from "@/features/preview/preview-accounts";
import { consumeHrInvite } from "@/features/hire/hr-invite";
import authConfig from "@/auth.config";
import { cookies } from "next/headers";
import { recordLegalConsents } from "@/features/legal/record-consent";
import { recordNewsletterOptIn } from "@/features/legal/record-newsletter-optin";
import { logger } from "@/lib/logger";
import { verifyRecruiterOtp } from "@/features/recruiter-auth/otp";
import { isJwtInvalidated } from "@/lib/account-status";
import {
  attachParsedImportToUser,
  evaluateGoogleLink,
  onGoogleAccountLinked,
} from "@/features/resume/import/claim";
import { authorizeEmailCode, authorizePassword } from "@/lib/email-auth";
import { isEmailLoginEnabled } from "@/lib/feature-flags";
import { hasPlatformAdmin } from "@/lib/platform-role";
//auth is the full config with PrismaAdapter and real Credentials authorize. Used everywhere else.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    /**
     * Plan 193, TEMPORARY — the preview link as a sign-in.
     *
     * A URL that authenticates, deliberately: while the platform is closed
     * behind the launch page, a preview link opens its side fully, with no
     * Google sign-in and no recruiter OTP. Everything else about auth is
     * untouched — this provider is additive and refuses in every case but one.
     *
     * The containments, all of them cheap:
     *   - refuses unless the launch gate is on, so a back door cannot outlive
     *     the launch page by accident;
     *   - accepts only a value equal to the configured token for that side;
     *   - `side` and `token` come from the httpOnly cookie middleware set, not
     *     from the URL (see app/preview/enter/route.ts);
     *   - signs in as a dedicated account, never a real person's, and never
     *     an admin;
     *   - every success is logged.
     *
     * Rotating a token in Vercel revokes every link built from it.
     */
    Credentials({
      id: "preview",
      name: "Preview link",
      credentials: {
        side: { label: "Side", type: "text" },
        token: { label: "Token", type: "text" },
      },
      async authorize(credentials) {
        if (!isLaunchOnePagerEnabled()) return null;

        const side = String(credentials?.side ?? "");
        if (side !== "candidate" && side !== "recruiter") return null;

        const token = String(credentials?.token ?? "");
        if (!hasPreviewAccess(side, token)) return null;

        const user = await ensurePreviewUser(side);
        logger.info("[preview] signed in through a preview link", {
          side,
          userId: user.id,
        });
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),

    /**
     * Plan 194 — an HR's one-click sign-in link.
     *
     * The token is single use, expires in seven days, is stored only as a
     * SHA-256 hash, and is spent inside `consumeHrInvite` before this returns.
     * It carries no identity of its own: the row says which address it was
     * issued to, so a forged or edited token matches nothing.
     *
     * Unlike the shared team preview link, each invite opens ONE named
     * recruiter's own account, so every action stays attributable to them.
     */
    Credentials({
      id: "hr-invite",
      name: "Recruiter invite link",
      credentials: { token: { label: "Token", type: "text" } },
      async authorize(credentials) {
        const token = String(credentials?.token ?? "");
        if (!token) return null;

        const holder = await consumeHrInvite(token);
        if (!holder) return null;

        return {
          id: holder.id,
          email: holder.email,
          name: holder.name ?? holder.email,
          role: holder.role,
        };
      },
    }),

    /**
     * Recruiter sign-in by emailed code.
     *
     * Credentials providers bypass the adapter, so `events.createUser` below
     * never fires for this path — the User row and its consent record have to
     * be written here. Without that we would hold a recruiter's data with no
     * record of them agreeing to anything, which is the exact case that hook
     * was added to prevent.
     */
    Credentials({
      id: "recruiter-otp",
      name: "Recruiter email code",
      credentials: {
        email: { label: "Email", type: "email" },
        code: { label: "Code", type: "text" },
      },
      async authorize(credentials) {
        if (!isRecruiterAuthEnabled()) return null;

        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const code = String(credentials?.code ?? "").trim();
        if (!email || !/^\d{6}$/.test(code)) return null;

        const verified = await verifyRecruiterOtp(email, code);
        if (!verified.ok) return null;

        // Signing in requires a registration. Accounts are created by the
        // registration flow, never here — a valid code for an unregistered
        // address must not become an account, or the review step means nothing.
        // Unapproved profiles are allowed through so they can reach the
        // "we're reviewing you" page; every recruiter surface still checks
        // `approved` for itself.
        const existing = await prisma.user.findFirst({
          where: { email, deletedAt: null, disabledAt: null },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            recruiterProfile: { select: { id: true } },
          },
        });
        if (!existing?.recruiterProfile) return null;

        return {
          id: existing.id,
          email: existing.email,
          name: existing.name,
          role: existing.role,
        };
      },
    }),
    /**
     * Plan 154. Candidate sign-in by emailed code — and first sign-in creates
     * the account, as Google does. Rules live in lib/email-auth.ts.
     */
    Credentials({
      id: "email-code",
      name: "Email code",
      credentials: {
        email: { label: "Email", type: "email" },
        code: { label: "Code", type: "text" },
      },
      authorize: (credentials) => authorizeEmailCode(credentials),
    }),
    /**
     * Plan 154. Password sign-in for both doors; `audience` says which, and a
     * door only opens its own accounts. Replaces the old "dev-credentials"
     * provider, which compared plain text.
     */
    Credentials({
      id: "password",
      name: "Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        audience: { label: "Audience", type: "text" },
      },
      authorize: (credentials, request) =>
        authorizePassword(credentials, request),
    }),
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [
          require("next-auth/providers/google").default({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
            authorization: {
              params: { prompt: "select_account" },
            },
            // Plan 154: lets a verified Google sign-in link to the account an
            // admin created from the student's résumé. `callbacks.signIn` →
            // `evaluateGoogleLink` narrows this to exactly that case and denies
            // every other existing-email link, as Auth.js did before.
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    /**
     * Plan 169. `auth.config.ts` owns `id` / `email` / `authTime`; it runs
     * first and this adds the one thing it cannot work out, because it is in
     * the Edge bundle and `hasPlatformAdmin` reaches Prisma.
     *
     * The query runs only on a real sign-in (`user` present), not on every
     * refresh. A revoke does not wait for the token to age out:
     * `revokePlatformAdminAction` stamps `sessionInvalidatedAt`, which the
     * `session` callback below turns into a dead session on the next request,
     * so the next token is minted with `isAdmin` recomputed.
     */
    async jwt(params) {
      const base = authConfig.callbacks?.jwt;
      const token = base ? await base(params) : params.token;
      if (token && params.user?.id) {
        (token as { isAdmin?: boolean }).isAdmin = await hasPlatformAdmin(
          params.user.id,
        );
      }
      return token;
    },
    async signIn({ user, account, profile }) {
      if (user?.id) {
        const row = await prisma.user.findUnique({
          where: { id: user.id },
          select: { deletedAt: true, disabledAt: true },
        });
        if (row?.deletedAt || row?.disabledAt) return false;
      }
      if (account?.provider === "google") {
        const decision = await evaluateGoogleLink({
          providerAccountId: account.providerAccountId,
          email: profile?.email ?? user?.email,
          emailVerified: (profile as { email_verified?: boolean } | undefined)?.email_verified === true,
        });
        // The exact outcome Auth.js produced before linking was enabled.
        if (decision === "deny") return "/login?error=OAuthAccountNotLinked";
      }
      // Plan 154: Google is about to attach to an account created another way
      // (emailed code or password). Allowed only for a live candidate account
      // whose address Google itself has verified. A recruiter must not slip
      // into the candidate door this way — without this, linking would sign
      // them in on /login and send them to candidate registration.
      if (isEmailLoginEnabled() && account?.provider === "google" && user?.email) {
        const existing = await prisma.user.findFirst({
          where: {
            email: { equals: user.email.trim().toLowerCase(), mode: "insensitive" },
          },
          orderBy: { createdAt: "asc" },
          select: {
            deletedAt: true,
            disabledAt: true,
            recruiterProfile: { select: { id: true } },
            accounts: { where: { provider: "google" }, select: { id: true } },
          },
        });
        if (existing && existing.accounts.length === 0) {
          if (existing.deletedAt || existing.disabledAt) return false;
          if (existing.recruiterProfile) return "/login?error=RecruiterAccount";
          const verified = (profile as { email_verified?: boolean } | undefined)
            ?.email_verified;
          if (verified !== true) return false;
        }
      }

      if (!user?.id) return true;
      const row = await prisma.user.findUnique({
        where: { id: user.id },
        select: { deletedAt: true, disabledAt: true },
      });
      if (row?.deletedAt || row?.disabledAt) return false;
      return true;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { isAdmin?: boolean }).isAdmin =
          token.isAdmin as boolean;
      }

      const authTime =
        typeof token.authTime === "number" ? token.authTime : undefined;
      const userId = token.id as string | undefined;
      if (userId) {
        const row = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            deletedAt: true,
            disabledAt: true,
            sessionInvalidatedAt: true,
          },
        });
        // authTime, not iat: Auth.js re-stamps iat on every refresh, so a
        // revoked session compared by iat came back after one refresh.
        if (
          row?.deletedAt ||
          row?.disabledAt ||
          isJwtInvalidated(authTime ?? token.iat, row?.sessionInvalidatedAt)
        ) {
          return { ...session, user: undefined as never };
        }
      }
      // Only a real sign-in time is exposed: it answers "signed in recently?"
      // for setting a first password, and an estimate must never say yes.
      session.authTime = token.authTimeEstimated === true ? undefined : authTime;
      return session;
    },
  },
  events: {
    /**
     * Fires exactly once, when the adapter first creates a User row — i.e. the
     * moment we begin holding someone's personal data. Every signup form
     * records its own consent, but OAuth sign-in creates the account before
     * any form is reached, so without this a visitor could sign in, never
     * finish registration, and leave us holding their data with no consent
     * record. The login page carries the matching notice.
     *
     * Never throws: a failure here must not break sign-in.
     */
    async createUser({ user }) {
      if (!user.id) return;
      await recordOAuthConsent(user.id, user.email ?? null, "oauth_signup");
      // Plan 154: an admin parsed this student's résumé but never registered
      // it — attach it so /register's résumé step is already done.
      try {
        await attachParsedImportToUser(user.id, user.email);
      } catch (error) {
        logger.error("[resume-import] attach at signup failed", {
          userId: user.id,
          error: String(error),
        });
      }
    },
    /**
     * Plan 154: a Google account was linked. For a student an admin imported
     * this IS the claim — the adapter linked their Google login to the User
     * created for them (`createUser` never fires for it, so their consent is
     * recorded here). For every ordinary signup it is a no-op.
     *
     * Never throws: a failure here must not break sign-in.
     */
    async linkAccount({ user, account }) {
      if (account.provider !== "google" || !user.id) return;
      try {
        const claimed = await onGoogleAccountLinked(user.id);
        if (claimed) await recordOAuthConsent(user.id, user.email ?? null, "oauth_claim");
      } catch (error) {
        logger.error("[resume-import] claim on link failed", {
          userId: user.id,
          error: String(error),
        });
      }
    },
  },
});

/**
 * Consent + newsletter preference for an OAuth arrival — the earliest point we
 * hold their data. The login page carries the matching notice and writes
 * klymb_newsletter_pref before OAuth starts. Never throws.
 */
async function recordOAuthConsent(
  userId: string,
  email: string | null,
  source: "oauth_signup" | "oauth_claim",
): Promise<void> {
  try {
    await recordLegalConsents({ userId, email, source });
    // Default true if the cookie is missing (e.g. old clients).
    let newsletterOptIn = true;
    try {
      const pref = (await cookies()).get("klymb_newsletter_pref")?.value;
      if (pref === "0") newsletterOptIn = false;
      if (pref === "1") newsletterOptIn = true;
    } catch {
      // cookies() can throw outside a request context — keep default.
    }
    await recordNewsletterOptIn({ userId, email, source, optIn: newsletterOptIn });
  } catch (error) {
    logger.error("[legal] oauth consent not recorded", {
      userId,
      source,
      error: String(error),
    });
  }
}
