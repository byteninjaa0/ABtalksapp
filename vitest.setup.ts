import { vi } from "vitest";

// `server-only` throws outside the Next.js server runtime; stub it for unit tests.
vi.mock("server-only", () => ({}));
