import { Skeleton } from "@/components/ui/skeleton";

export default function MissionLoading() {
  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <div className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="size-9 rounded-full" />
        </div>
      </div>
      <div className="mx-auto w-full max-w-4xl flex-1 space-y-12 px-4 py-10 sm:space-y-16 sm:py-14">
        <section className="rounded-2xl px-4 py-8 text-center sm:px-8 sm:py-12">
          <Skeleton className="mx-auto h-7 w-32 rounded-full" />
          <Skeleton className="mx-auto mt-6 h-10 w-3/4 max-w-md" />
          <Skeleton className="mx-auto mt-4 h-5 w-full max-w-lg" />
          <Skeleton className="mx-auto mt-2 h-5 w-4/5 max-w-md" />
        </section>
        <section className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="rounded-2xl border bg-card p-5">
                <Skeleton className="mb-4 size-10 rounded-xl" />
                <Skeleton className="h-6 w-40" />
                <Skeleton className="mt-2 h-4 w-full" />
                <Skeleton className="mt-1 h-4 w-[90%]" />
              </div>
            ))}
          </div>
        </section>
        <section className="space-y-4">
          <Skeleton className="h-8 w-56" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </section>
      </div>
    </div>
  );
}
