"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";

type Preference = {
  eventType: string;
  label: string;
  channel: "email";
  enabled: boolean;
  canDisable: boolean;
};

export function NotificationPreferencesForm({
  preferences: initial,
}: {
  preferences: Preference[];
}) {
  const [preferences, setPreferences] = useState(initial);
  const [saving, setSaving] = useState<string | null>(null);

  async function toggle(eventType: string, enabled: boolean) {
    setSaving(eventType);

    const res = await fetch("/api/notification-preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType, channel: "email", enabled }),
    });

    if (res.ok) {
      setPreferences((prev) =>
        prev.map((p) =>
          p.eventType === eventType ? { ...p, enabled } : p,
        ),
      );
    }

    setSaving(null);
  }

  return (
    <div className="divide-y divide-border rounded-lg border">
      {preferences.map((pref) => (
        <div
          key={pref.eventType}
          className="flex items-center justify-between px-4 py-3"
        >
          <div>
            <p className="text-sm font-medium">{pref.label}</p>
            <p className="text-xs text-muted-foreground">
              {pref.canDisable ? "Email" : "Email · Always on"}
            </p>
          </div>
          <Switch
            checked={pref.enabled}
            onCheckedChange={(checked) =>
              toggle(pref.eventType, checked)
            }
            disabled={!pref.canDisable || saving === pref.eventType}
            size="sm"
          />
        </div>
      ))}
    </div>
  );
}
