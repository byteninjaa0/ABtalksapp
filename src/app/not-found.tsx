import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container mx-auto px-6 py-20 text-center">
      <h1 className="font-display text-4xl font-bold">404</h1>
      <p className="mt-2 text-muted-foreground">Page not found</p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
