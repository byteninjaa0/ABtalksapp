import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { JobAlertForm } from "@/components/jobs/job-alert-form";
import { getMyJobAlertAction } from "@/app/actions/job-alert-actions";

export const metadata: Metadata = { title: "Job alerts | ABTalks" };

export default async function JobAlertsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const current = await getMyJobAlertAction();
  const alert = current.ok ? current.data.alert : null;

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "40px 24px",
        color: "#111",
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.2 }}>Job alerts</h1>
        <p style={{ marginTop: 8, color: "#555", maxWidth: 560 }}>
          Get notified when a newly published job matches what you are looking
          for. Leave a field empty to match any value. Match uses simple rules,
          not a recommendation engine.
        </p>
      </header>

      <JobAlertForm initial={alert} />

      <section style={{ marginTop: 32, fontSize: 13, color: "#777" }}>
        <p style={{ margin: 0 }}>
          You will be alerted <strong>once per job</strong>. Editing or
          re-publishing the same role never triggers another alert. You can
          turn alerts off at any time.
        </p>
      </section>
    </main>
  );
}
