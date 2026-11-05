import { headers } from "next/headers";
import { HackathonDirectUntrackedTile } from "@/components/admin/hackathon-direct-untracked-tile";
import { HackathonLinkAdd } from "@/components/admin/hackathon-link-add";
import { HackathonLinkCopy } from "@/components/admin/hackathon-link-copy";
import { HackathonLinkRowActions } from "@/components/admin/hackathon-link-row-actions";
import { HackathonLinkView } from "@/components/admin/hackathon-link-view";
import { HackathonUnknownSlugRow } from "@/components/admin/hackathon-unknown-slug-row";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getHackathonLinkStats } from "@/features/hackathon/get-link-stats";

export default async function AdminHackathonLinksPage() {
  const headersList = await headers();
  const host = headersList.get("host") ?? "app.klymb.ai";
  const protocol = host.includes("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  const stats = await getHackathonLinkStats();
  const {
    links,
    totalRegistrations,
    attributedRegistrations,
    directRegistrations,
    directUsers,
    unknownSlugs,
  } = stats;

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold md:text-3xl">
            Hackathon Links
          </h1>
          <p className="text-sm text-muted-foreground">
            Registrations attributed to share links (`?s=`). First touch wins.
          </p>
        </div>
        <HackathonLinkAdd />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryTile label="Total registrations" value={totalRegistrations} />
        <SummaryTile label="From tracked links" value={attributedRegistrations} />
        <HackathonDirectUntrackedTile
          count={directRegistrations}
          users={directUsers}
        />
        <SummaryTile label="Active links" value={links.length} />
      </div>

      {links.length === 0 ? (
        <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          No share links yet. Click &ldquo;Add link&rdquo; above to create one.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Registrations</TableHead>
                <TableHead>Link</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.map((row) => {
                const url = `${baseUrl}/hackathon?s=${row.slug}`;

                return (
                  <TableRow key={row.slug} className="group/row">
                    <TableCell>
                      <div className="font-medium">{row.label}</div>
                      {row.note ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {row.note}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {row.slug}
                    </TableCell>
                    <TableCell className="font-bold tabular-nums">
                      {row.registrations}
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-md items-center gap-2">
                        <span className="truncate font-mono text-xs text-muted-foreground">
                          {url}
                        </span>
                        <HackathonLinkView
                          label={row.label}
                          slug={row.slug}
                          users={row.users}
                        />
                        <HackathonLinkCopy url={url} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <HackathonLinkRowActions
                          id={row.id}
                          slug={row.slug}
                          label={row.label}
                          note={row.note}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {unknownSlugs.length > 0 ? (
        <div className="space-y-2">
          <div>
            <h2 className="text-lg font-semibold">Unrecognized slugs</h2>
            <p className="text-sm text-muted-foreground">
              These registrations used a <span className="font-mono">?s=</span>{" "}
              value with no matching row in{" "}
              <span className="font-mono">HackathonLink</span>.
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Slug</TableHead>
                  <TableHead>Registrations</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {unknownSlugs.map((row) => (
                  <HackathonUnknownSlugRow
                    key={row.slug}
                    slug={row.slug}
                    registrations={row.registrations}
                    users={row.users}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
