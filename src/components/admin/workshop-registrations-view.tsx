"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { WorkshopRegistrationRow } from "@/features/workshop/get-admin-data";
import { downloadCSV, toCSV } from "@/lib/csv";
import { formatDateIST } from "@/lib/date-utils";

interface Props {
  rows: WorkshopRegistrationRow[];
  /** eventId → display title, for the Event column. */
  eventLabels: Record<string, string>;
  showEventColumn: boolean;
  exportName: string;
}

export function WorkshopRegistrationsView({
  rows,
  eventLabels,
  showEventColumn,
  exportName,
}: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.email, r.phone, r.role, r.organization ?? "", r.eventId]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, query]);

  const handleExport = () => {
    if (filtered.length === 0) {
      toast.error("Nothing to export.");
      return;
    }
    const csv = toCSV(
      filtered.map((r) => ({
        // eventId first: it is the column that identifies which workshop a row
        // belongs to, and it is what makes a merged export unambiguous.
        eventId: r.eventId,
        workshop: eventLabels[r.eventId] ?? r.eventId,
        name: r.name,
        email: r.email,
        phone: r.phone,
        role: r.role,
        organization: r.organization ?? "",
        graduationYear: r.graduationYear ?? "",
        klymbMember: r.isMember ? "yes" : "no",
        registeredAt: r.createdAt,
      })),
    );
    downloadCSV(`workshop-${exportName}.csv`, csv);
    toast.success(`Exported ${filtered.length} registrations.`);
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        No registrations for the selected workshop{showEventColumn ? "s" : ""}.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder="Search name, email, phone, organization…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-xs"
        />
        <Button variant="outline" onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {query && (
        <p className="text-sm text-muted-foreground">
          {filtered.length} of {rows.length} shown
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {showEventColumn && <TableHead>Workshop</TableHead>}
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Grad year</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Registered</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id}>
                {showEventColumn && (
                  <TableCell className="max-w-[220px]">
                    <span className="block truncate font-medium">
                      {eventLabels[r.eventId] ?? r.eventId}
                    </span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">
                      {r.eventId}
                    </span>
                  </TableCell>
                )}
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-muted-foreground">{r.email}</TableCell>
                <TableCell className="text-muted-foreground">{r.phone}</TableCell>
                <TableCell>{r.role}</TableCell>
                <TableCell className="text-muted-foreground">
                  {r.organization ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.graduationYear ?? "—"}
                </TableCell>
                <TableCell>
                  {/* Every row has an account now, so the useful distinction is
                      full Klymb AI member vs workshop-only signup. */}
                  <Badge variant={r.isMember ? "default" : "secondary"}>
                    {r.isMember ? "Member" : "Workshop only"}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDateIST(r.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
