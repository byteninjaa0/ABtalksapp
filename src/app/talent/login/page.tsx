import { redirect } from "next/navigation";

type Props = { searchParams: Promise<{ from?: string }> };

/**
 * Kept as a redirect, not deleted.
 *
 * Guards and older links point here, and the recruiter door is now one page
 * carrying both halves — register on top, sign in beneath — so there is nothing
 * left to render separately.
 */
export default async function RecruiterLoginRedirect({ searchParams }: Props) {
  const { from } = await searchParams;
  const safe = from && from.startsWith("/") && !from.startsWith("//") ? from : null;
  redirect(safe ? `/talent/register?from=${encodeURIComponent(safe)}` : "/talent/register");
}
