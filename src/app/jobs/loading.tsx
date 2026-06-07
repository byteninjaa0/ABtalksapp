import { Skeleton } from "@/components/ui/skeleton";

export default function JobsLoading() {
  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <div className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="size-9 rounded-full" />
        </div>
      </div>
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="mt-2 h-4 w-64" />
        <ul className="mt-8 grid gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i}>
              <div className="rounded-xl border bg-card p-5">
                <div className="flex justify-between gap-2">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <Skeleton className="mt-3 h-3 w-40" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
