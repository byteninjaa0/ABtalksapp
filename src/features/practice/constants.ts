/** Practice score by difficulty — drives topic progress bars and total practice score. */
export const PRACTICE_MAX_SCORE = { EASY: 10, MEDIUM: 20, HARD: 35 } as const;

/** Synergy credited on first solve. Deliberately far below the daily-submission
 *  award (10–23) so practice supplements the challenge instead of replacing it. */
export const PRACTICE_SYNERGY = { EASY: 1, MEDIUM: 2, HARD: 3 } as const;

/** Max first-solves that earn synergy per IST calendar day. Practice score is uncapped. */
export const PRACTICE_SYNERGY_DAILY_CAP = 5;

/** Max attempt rows a user may write per IST day — DB spam guard, not a scoring rule. */
export const PRACTICE_ATTEMPTS_DAILY_LIMIT = 200;

export const PRACTICE_MAX_SOURCE_CHARS = 20_000;

/** Pin the exact Pyodide version — never a floating URL. Verify the current stable
 *  release at https://pyodide.org/en/stable/ before setting this. */
export const PYODIDE_VERSION = "314.0.4";
export const PYODIDE_CDN_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

/** Per-run wall clock before the worker is terminated and respawned. */
export const PRACTICE_RUN_TIMEOUT_MS = 5_000;
/** Cold Pyodide boot allowance. */
export const PRACTICE_BOOT_TIMEOUT_MS = 30_000;
