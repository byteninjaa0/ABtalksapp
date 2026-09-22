import type { Metadata } from "next";
import { requireRecruiter } from "@/lib/program-auth";
import { getRecruiterProfileAction } from "@/app/actions/recruiter-profile-actions";
import { RecruiterProfileForm } from "@/components/hire/recruiter-profile-form";

export const metadata: Metadata = {
  title: "Your profile | ABTalks Hire",
};

/**
 * Recruiter profile page (T-227). Was /hire/settings, which held nothing but
 * this form; it is now reached from the account row in the sidebar, and
 * /hire/settings redirects here (next.config.ts).
 * Allows the recruiter to view and edit their profile (name, phone) and
 * company identity (name, website, industry, size, location).
 * Isolated per-recruiter workspace via requireRecruiter().
 */
export default async function HireProfilePage() {
  await requireRecruiter();
  const res = await getRecruiterProfileAction();

  if (!res.ok) {
    return (
      <div className="hire-settings space-y-6 pb-12">
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-wider text-primary uppercase">
            Account
          </p>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
            Your profile
          </h1>
          <p className="max-w-2xl text-sm text-destructive">
            {res.message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="hire-settings space-y-6 pb-12">
      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-wider text-primary uppercase">
          Account
        </p>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
          Your profile
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Manage your personal recruiter profile and company identity. Changes
          reflect on your outreach messages, candidate searches, and job posts.
        </p>
      </div>

      <RecruiterProfileForm initialData={res.data} />
    </div>
  );
}
