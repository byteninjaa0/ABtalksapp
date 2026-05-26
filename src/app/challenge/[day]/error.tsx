"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ChallengeDayError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Challenge day page error:", error);
  }, [error]);

  return (
    <div className="container mx-auto flex min-h-[50vh] flex-col items-center justify-center p-8 text-center">
      <h2 className="text-xl font-bold">Something went wrong</h2>
      <p className="mt-2 max-w-md text-muted-foreground">
        We couldn&apos;t load this challenge day. Your progress is safe — try
        again in a moment.
      </p>
      <Button type="button" className="mt-4" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}
