import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";

export default function DashboardLoading() {
  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <div className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Skeleton className="h-6 w-24" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-16 rounded-full" />
            <Skeleton className="size-9 rounded-full" />
          </div>
        </div>
      </div>
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:px-6">
        <Card>
          <CardHeader className="pb-3">
            <Skeleton className="h-7 w-52" />
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent className="px-5 pb-6">
            <div className="grid w-max grid-cols-10 gap-1.5 sm:gap-2">
              {Array.from({ length: 60 }).map((_, i) => (
                <Skeleton key={i} className="size-7 rounded-md sm:size-9" />
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-3 w-20" />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-6">
              <Skeleton className="h-16 w-16" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-7 w-3/4" />
                <Skeleton className="h-10 w-48" />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="space-y-3 p-6 pt-6">
                <Skeleton className="h-10 w-16" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-2 w-full rounded-full" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-28" />
          </CardHeader>
          <CardContent className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
