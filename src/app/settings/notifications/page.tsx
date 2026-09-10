import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  EVENT_TYPE_REGISTRY,
  EVENT_TYPES,
} from "@/features/notification/event-types";
import { NotificationPreferencesForm } from "@/components/settings/notification-preferences-form";

export default async function NotificationSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const rows = await prisma.notificationPreference.findMany({
    where: { userId: session.user.id },
    select: { eventType: true, channel: true, enabled: true },
  });

  const prefMap = new Map(
    rows.map((r) => [`${r.eventType}:${r.channel}`, r.enabled]),
  );

  const preferences = EVENT_TYPES.filter(
    (et) => EVENT_TYPE_REGISTRY[et].priority === "important",
  ).map((et) => {
    const config = EVENT_TYPE_REGISTRY[et];
    return {
      eventType: et,
      label: config.label,
      channel: "email" as const,
      enabled: prefMap.get(`${et}:email`) ?? config.defaultEmailEnabled,
      canDisable: !config.emailExempt,
    };
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold mb-2">Notification Settings</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Choose which email notifications you receive. In-app notifications are
        always on.
      </p>
      <NotificationPreferencesForm preferences={preferences} />
    </main>
  );
}
