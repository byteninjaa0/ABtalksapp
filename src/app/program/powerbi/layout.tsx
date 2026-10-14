import { notFound } from "next/navigation";
import Link from "next/link";
import { isPowerBiEnabled } from "@/lib/feature-flags";
import { SiteSearchSlot } from "@/components/dashboard-hub/site-search-slot";
import { Wordmark } from "@/components/shared/wordmark";

export default function PowerBiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isPowerBiEnabled()) notFound();

  return (
    <div className="theme-abtalks-light theme-abtalks-brand min-h-svh bg-[#F4F4F4] font-content text-black">
      <header className="abt-header">
        <div className="abt-header-inner">
          <Link href="/" className="shrink-0" aria-label="Klymb AI home">
            <Wordmark size="md" className="h-7 w-auto brightness-0" />
          </Link>
          <SiteSearchSlot />
        </div>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-[1536px] px-4 py-6">
        {children}
      </main>
    </div>
  );
}
