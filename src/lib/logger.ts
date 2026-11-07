/**
 * The application logger — T-259.
 *
 * Structured JSON, one object per line, straight to stdout (which is what
 * Vercel's log drain reads).
 *
 * `LOG_PRETTY=1` swaps stdout for `pino-pretty` so a local `npm run dev` is
 * readable. It is a devDependency and is loaded lazily behind that flag, so it
 * is never required — or bundled — in production. Production must stay JSON:
 * the drain parses it, and T-268's admin view parses what the drain stores.
 *
 * ## Why the two call shapes
 *
 * The 111 call sites that predate T-259 call `logger.error("msg", { meta })`.
 * Pino's own order is the reverse, `logger.error({ meta }, "msg")`. Both work
 * here, and both produce the same JSON — rewriting a hundred call sites to gain
 * nothing was not worth the diff, and the new instrumentation reads better in
 * pino order. The object form is preferred for new code.
 *
 * ## Redaction
 *
 * Two layers, because one is not enough:
 *  - pino's own `redact` catches the named paths at serialise time;
 *  - `scrubDeep` runs first and catches *values* that look like secrets or PII
 *    wherever they sit, including inside a message a provider SDK wrote.
 *
 * See `@/lib/observability/redact`. Never bypass this module with
 * `console.log` on an operational path.
 */

import pino, { type Logger as PinoLogger } from "pino";
import {
  REDACTED,
  SENSITIVE_KEYS,
  errorFields,
  safeErrorMessage,
  scrubDeep,
} from "@/lib/observability/redact";

export { errorFields, safeErrorMessage };

export type LogMeta = Record<string, unknown>;

/**
 * pino redact paths, derived from the shared key list so the two can't drift.
 * `*.x` covers one level of nesting; deeper nesting is handled by `scrubDeep`,
 * which runs before pino sees the object.
 */
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const REDACT_PATHS = [
  // Keys with a dash (`set-cookie`) are not valid pino path syntax and are
  // dropped here — `scrubDeep` still catches them by name.
  ...SENSITIVE_KEYS.filter((k) => IDENTIFIER.test(k)).flatMap((k) => [
    k,
    `*.${k}`,
  ]),
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['set-cookie']",
  "res.headers['set-cookie']",
  "request.headers.authorization",
  "request.headers.cookie",
];

/**
 * The exact options the process logger runs with.
 *
 * Exported so the redaction tests can drive a logger with *this* configuration
 * into an in-memory stream. pino writes to fd 1 through SonicBoom, which no
 * amount of `process.stdout.write` patching can intercept — testing a
 * re-declared copy of the config would prove nothing about the real one.
 */
export const loggerOptions: pino.LoggerOptions = {
  level:
    process.env.LOG_LEVEL ??
    (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: {
    service: process.env.OTEL_SERVICE_NAME ?? "klymb-web",
    env:
      process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV ?? "development",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: { paths: REDACT_PATHS, censor: REDACTED },
  formatters: {
    // `"level":"error"` reads better in a log drain than `"level":50`.
    level: (label) => ({ level: label }),
  },
  // Errors passed as `{ err }` get scrubbed rather than pino's raw serializer.
  serializers: {
    err: (e: unknown) => scrubDeep(e),
    error: (e: unknown) => scrubDeep(e),
  },
};

/**
 * `pino-pretty`, only when asked for and only when it is actually installed.
 * A missing devDependency in production must not be able to stop the process —
 * the logger falls back to JSON, which is what production wants anyway.
 */
function prettyDestination(): pino.DestinationStream | undefined {
  if (process.env.LOG_PRETTY !== "1") return undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pretty = require("pino-pretty") as (o: object) => pino.DestinationStream;
    return pretty({
      colorize: true,
      translateTime: "SYS:HH:MM:ss",
      // The fields every line carries; repeating them per line is noise here.
      ignore: "pid,hostname,service,env",
      messageFormat: "{msg}{if event} [{event}]{end}",
    });
  } catch {
    return undefined;
  }
}

const prettyStream = prettyDestination();
const root: PinoLogger = prettyStream
  ? pino(loggerOptions, prettyStream)
  : pino(loggerOptions);

type Level = "debug" | "info" | "warn" | "error";

export interface AppLogger {
  debug(message: string, meta?: LogMeta): void;
  debug(meta: LogMeta, message?: string): void;
  info(message: string, meta?: LogMeta): void;
  info(meta: LogMeta, message?: string): void;
  warn(message: string, meta?: LogMeta): void;
  warn(meta: LogMeta, message?: string): void;
  error(message: string, meta?: LogMeta): void;
  error(meta: LogMeta, message?: string): void;
  /** A logger with extra fields bound to every line it writes. */
  child(bindings: LogMeta): AppLogger;
  /** The underlying pino instance, for the rare case that needs it. */
  raw: PinoLogger;
}

function emit(
  target: PinoLogger,
  lvl: Level,
  a: string | LogMeta,
  b?: string | LogMeta,
): void {
  if (typeof a === "string") {
    const meta = b as LogMeta | undefined;
    if (meta) target[lvl](scrubDeep(meta) as object, a);
    else target[lvl](a);
    return;
  }
  const msg = typeof b === "string" ? b : undefined;
  const obj = scrubDeep(a) as object;
  if (msg) target[lvl](obj, msg);
  else target[lvl](obj);
}

function wrap(target: PinoLogger): AppLogger {
  return {
    debug: (a: string | LogMeta, b?: string | LogMeta) =>
      emit(target, "debug", a, b),
    info: (a: string | LogMeta, b?: string | LogMeta) =>
      emit(target, "info", a, b),
    warn: (a: string | LogMeta, b?: string | LogMeta) =>
      emit(target, "warn", a, b),
    error: (a: string | LogMeta, b?: string | LogMeta) =>
      emit(target, "error", a, b),
    child: (bindings: LogMeta) =>
      wrap(target.child(scrubDeep(bindings) as LogMeta)),
    raw: target,
  } as AppLogger;
}

export const logger: AppLogger = wrap(root);

/**
 * A logger with the production configuration writing somewhere else. Test-only
 * — nothing in `src/app`, `src/features` or `src/repositories` should call it.
 */
export function createLoggerTo(destination: pino.DestinationStream): AppLogger {
  return wrap(pino(loggerOptions, destination));
}

/**
 * A child logger bound to one request.
 *
 * `requestId` comes from `getRequestId()` (the `x-request-id` middleware
 * stamps). Passing `undefined` is fine — the field is simply omitted, which is
 * the honest representation of "this ran outside a request".
 */
export function reqLogger(
  requestId?: string | null,
  extra?: LogMeta,
): AppLogger {
  const bindings: LogMeta = { ...extra };
  if (requestId) bindings.requestId = requestId;
  return logger.child(bindings);
}
