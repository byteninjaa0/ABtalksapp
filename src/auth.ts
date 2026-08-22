import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import authConfig from "@/auth.config";
import { cookies } from "next/headers";
import { recordLegalConsents } from "@/features/legal/record-consent";
import { recordNewsletterOptIn } from "@/features/legal/record-newsletter-optin";
import { logger } from "@/lib/logger";
import {
  NEWSLETTER_PREF_COOKIE,
  newsletterOptInFromPrefCookie,
} from "@/lib/newsletter-pref";
//auth is the full config with PrismaAdapter and real Credentials authorize. Used everywhere else.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    ...(process.env.ENABLE_DEV_AUTH === "true"
      ? [
          Credentials({
            name: "Dev Login",
            credentials: {
              email: { label: "Email", type: "email" },
              password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
              if (!credentials?.email || !credentials?.password) return null;

              const user = await prisma.user.findUnique({
                where: { email: String(credentials.email) },
              });

              if (!user || !user.password) return null;
              if (user.password !== String(credentials.password)) return null;

              return {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
              };
            },
          }),
        ]
      : []),
    ...(authConfig.providers.filter((p) => p.id !== "credentials") ?? []),
  ],
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
      try {
        await recordLegalConsents({
          userId: user.id,
          email: user.email ?? null,
          source: "oauth_signup",
        });
        // Login page writes NEWSLETTER_PREF_COOKIE before OAuth starts.
        // Default true if the cookie is missing (e.g. old clients).
        let newsletterOptIn = true;
        try {
          const pref = (await cookies()).get(NEWSLETTER_PREF_COOKIE)?.value;
          newsletterOptIn = newsletterOptInFromPrefCookie(pref);
        } catch {
          // cookies() can throw outside a request context — keep default.
        }
        await recordNewsletterOptIn({
          userId: user.id,
          email: user.email ?? null,
          source: "oauth_signup",
          optIn: newsletterOptIn,
        });
      } catch (error) {
        logger.error("[legal] oauth signup consent not recorded", {
          userId: user.id,
          error: String(error),
        });
      }
    },
  },
});
