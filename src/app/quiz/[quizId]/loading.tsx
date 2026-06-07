import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function QuizLoading() {
  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <div className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="size-9 rounded-full" />
        </div>
      </div>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Skeleton className="mb-6 h-8 w-2/3" />
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="space-y-4 p-6">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-[90%]" />
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <Skeleton key={j} className="h-10 w-full rounded-lg" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          <Skeleton className="h-11 w-32" />
        </div>
      </main>
    </div>
  );
}
