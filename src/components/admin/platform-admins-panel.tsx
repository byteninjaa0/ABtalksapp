"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  grantPlatformAdminAction,
  revokePlatformAdminAction,
} from "@/app/actions/admin-platform-actions";

export type PlatformAdminRow = {
  id: string;
  email: string;
  name: string | null;
  grantedAt: string;
};

export function PlatformAdminsPanel({
  admins,
}: {
  admins: PlatformAdminRow[];
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function grant() {
    setBusy("grant");
    try {
      const res = await grantPlatformAdminAction({ email });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Admin granted.");
      setEmail("");
      window.location.reload();
    } finally {
      setBusy(null);
    }
  }

  async function revoke(assignmentId: string) {
    const reason = window.prompt("Reason for revoking admin access?");
    if (!reason || reason.trim().length < 3) {
      toast.error("A reason is required.");
      return;
    }
    setBusy(assignmentId);
    try {
      const res = await revokePlatformAdminAction({
        assignmentId,
        reason: reason.trim(),
      });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Admin revoked.");
      window.location.reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void grant();
        }}
      >
        <div className="min-w-0 flex-1">
          <label htmlFor="admin-email" className="text-sm font-medium">
            Grant Platform Admin
          </label>
          <input
            id="admin-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="person@klymb.ai"
            className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
          />
        </div>
        <Button type="submit" disabled={busy === "grant"}>
          {busy === "grant" ? "Granting…" : "Grant"}
        </Button>
      </form>

      {admins.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No database-backed admins yet. Sign in with an ADMIN_EMAILS address
          once to bootstrap, then grant others here.
        </p>
      ) : (
        <ul className="space-y-3">
          {admins.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm"
            >
              <div>
                <p className="font-medium">{row.name ?? row.email}</p>
                <p className="text-muted-foreground">{row.email}</p>
                <p className="text-xs text-muted-foreground">
                  Granted {new Date(row.grantedAt).toLocaleString()}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={busy === row.id}
                onClick={() => void revoke(row.id)}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
