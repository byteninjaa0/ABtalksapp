"use client";

/**
 * Root-level error UI. Must define html/body and avoid design-system imports
 * that depend on React context (theme, etc.) so /_global-error can prerender.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ marginTop: 8, fontSize: 14, color: "#555" }}>
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          type="button"
          style={{
            marginTop: 16,
            padding: "8px 16px",
            fontSize: 14,
            cursor: "pointer",
          }}
          onClick={() => reset()}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
