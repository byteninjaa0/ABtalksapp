"use client";

import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Recruiter analytics, built with the same vocabulary as the admin dashboard
 * (`components/admin/analytics-dashboard.tsx`): shadcn `Card` per chart, a
 * two-column grid, recharts at a fixed 280px height, and one full-width table
 * card at the end. Kept deliberately parallel so the two analytics surfaces
 * read as the same product rather than two people's idea of a dashboard.
 *
 * Renders inside the Hire shell, so it keeps the recruiter header and sidebar.
 *
 * The brand teal is used directly rather than `hsl(var(--primary))`: this tree
 * renders under `theme-klymb-light`, where that token is not the same colour
 * the admin charts get.
 */
const TEAL = "#03535F";

export type RecruiterAnalyticsChartsData = {
  funnel: Array<{ label: string; count: number }>;
  assessments: Array<{ label: string; count: number }>;
  workspace: Array<{ label: string; count: number }>;
  projects: Array<{
    id: string;
    name: string;
    matched: number;
    viewed: number;
    shortlisted: number;
  }>;
};

export function RecruiterAnalyticsCharts({
  data,
}: {
  data: RecruiterAnalyticsChartsData;
}) {
  // Long project names do not fit under vertical bars, so this one chart is
  // laid out horizontally. Same card, same axes, same tooltip.
  const projectBars = data.projects.map((p) => ({
    name: p.name,
    count: p.matched,
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Candidate Funnel</CardTitle>
        </CardHeader>
        <CardContent className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.funnel}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar
                dataKey="count"
                fill={TEAL}
                radius={[6, 6, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspace Overview</CardTitle>
        </CardHeader>
        <CardContent className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.workspace}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar
                dataKey="count"
                fill={TEAL}
                radius={[6, 6, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assessment Activity</CardTitle>
        </CardHeader>
        <CardContent className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.assessments}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar
                dataKey="count"
                fill={TEAL}
                radius={[6, 6, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Candidates Matched by Project</CardTitle>
        </CardHeader>
        <CardContent className="h-[280px]">
          {projectBars.length === 0 ? (
            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No talent projects yet.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={projectBars} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={150}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip />
                <Bar
                  dataKey="count"
                  fill={TEAL}
                  radius={[0, 6, 6, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Talent Projects</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project Name</TableHead>
                  <TableHead>Matched</TableHead>
                  <TableHead>Viewed</TableHead>
                  <TableHead>Shortlisted</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.projects.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground"
                    >
                      No talent projects created yet. Start a search on the Scout
                      desk to generate candidate matches.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.projects.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>{row.matched}</TableCell>
                      <TableCell>{row.viewed}</TableCell>
                      <TableCell>{row.shortlisted}</TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/hire/${row.id}`}
                          className="text-sm font-semibold text-[#03535F] hover:underline"
                        >
                          Open Desk
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
