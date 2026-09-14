import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { JobAlertsScreen } from "@/components/jobs/job-alerts-screen";
import { listMyJobAlertsAction } from "@/app/actions/job-alert-actions";
import { MAX_ALERTS_PER_CANDIDATE } from "@/features/job-alerts/service";

export const metadata: Metadata = { title: "Job alerts | ABTalks" };

export default async function JobAlertsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const res = await listMyJobAlertsAction();
  const alerts = res.ok ? res.data.alerts : [];

  return (
    <main
      style={{
        maxWidth: 820,
        margin: "0 auto",
        padding: "40px 24px",
        color: "#111",
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.2 }}>Job alerts</h1>
        <p style={{ marginTop: 8, color: "#555", maxWidth: 620 }}>
          Get notified when a newly published job matches what you are looking
          for. Add as many alerts as you want — one for each kind of role you
          care about.
        </p>
      </header>

      <JobAlertsScreen initial={alerts} maxAlerts={MAX_ALERTS_PER_CANDIDATE} />

      <section
        style={{ marginTop: 32, fontSize: 13, color: "#777", maxWidth: 620 }}
      >
        <p style={{ margin: 0 }}>
          You will be alerted <strong>once per job</strong>, even if several of
          your alerts match. Editing or re-publishing the same role never
          triggers another alert.
        </p>
      </section>
    </main>
  );
}
