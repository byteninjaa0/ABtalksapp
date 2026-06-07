import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";

export default function ProfileLoading() {
  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <div className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="size-9 rounded-full" />
        </div>
      </div>
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 space-y-5 px-4 py-5 sm:space-y-8 sm:py-8">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="grid min-w-0 gap-5 sm:gap-8 lg:grid-cols-2">
          <Card>
            <CardContent className="flex gap-4 p-6">
              <Skeleton className="size-20 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-7 w-40" />
                <Skeleton className="h-4 w-48" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="h-6 w-24 rounded-full" />
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-4 w-56" />
              </CardHeader>
              <CardContent className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-20" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-40" />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
