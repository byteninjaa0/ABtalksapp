import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const isDualWriteEnabled = vi.hoisted(() => vi.fn());
const loggerError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/feature-flags", () => ({
  isDualWriteEnabled,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: loggerError, info: vi.fn(), warn: vi.fn() },
}));

import { runDualWrite } from "@/repositories/dual-write";

beforeEach(() => {
  vi.clearAllMocks();
  isDualWriteEnabled.mockReturnValue(false);
});

afterEach(() => {
  isDualWriteEnabled.mockReturnValue(false);
});

describe("runDualWrite", () => {
  it("no-ops when ENABLE_DUAL_WRITE is off", async () => {
    const executeRawUnsafe = vi.fn();
    const fn = vi.fn();

    await runDualWrite({ $executeRawUnsafe: executeRawUnsafe } as never, "points", fn);

    expect(fn).not.toHaveBeenCalled();
    expect(executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("releases the SAVEPOINT after a successful new-table write", async () => {
    isDualWriteEnabled.mockReturnValue(true);
    const executeRawUnsafe = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockResolvedValue(undefined);

    await runDualWrite({ $executeRawUnsafe: executeRawUnsafe } as never, "points", fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(executeRawUnsafe.mock.calls.map((c) => c[0])).toEqual([
      "SAVEPOINT dw_points",
      "RELEASE SAVEPOINT dw_points",
    ]);
    expect(loggerError).not.toHaveBeenCalled();
  });

  it("rolls back the SAVEPOINT and keeps legacy when the new write fails", async () => {
    isDualWriteEnabled.mockReturnValue(true);
    const executeRawUnsafe = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockRejectedValue(new Error("credential upsert failed"));

    await runDualWrite(
      { $executeRawUnsafe: executeRawUnsafe } as never,
      "credential",
      fn,
    );

    expect(executeRawUnsafe.mock.calls.map((c) => c[0])).toEqual([
      "SAVEPOINT dw_credential",
      "ROLLBACK TO SAVEPOINT dw_credential",
    ]);
    expect(loggerError).toHaveBeenCalledWith(
      "[078 dual-write] new write failed; legacy kept",
      expect.objectContaining({ label: "credential" }),
    );
  });

  it("sanitizes SAVEPOINT labels to alphanumeric characters", async () => {
    isDualWriteEnabled.mockReturnValue(true);
    const executeRawUnsafe = vi.fn().mockResolvedValue(undefined);

    await runDualWrite(
      { $executeRawUnsafe: executeRawUnsafe } as never,
      "candidate-identity!",
      vi.fn().mockResolvedValue(undefined),
    );

    expect(executeRawUnsafe.mock.calls[0]?.[0]).toBe(
      "SAVEPOINT dw_candidateidentity",
    );
  });
});
