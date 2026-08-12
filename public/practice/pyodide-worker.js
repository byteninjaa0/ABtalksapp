/**
 * Pyodide practice runner — plain JS so it stays out of Turbopack / React Compiler.
 *
 * Protocol:
 *   main → worker: { type: "boot", indexURL: string }
 *   worker → main: { type: "ready" } | { type: "boot-error", message: string }
 *   main → worker: { type: "run", code: string, cases: [{ ordinal: number, input: string }] }
 *   worker → main: { type: "results", results: [{ ordinal, stdout, stderr, runtimeMs }] }
 *
 * Pass/fail is decided on the main thread. This worker only returns stdout/stderr.
 */

/** @type {import("pyodide").PyodideInterface | null} */
let pyodide = null;

/**
 * @param {string} indexURL
 */
async function boot(indexURL) {
  importScripts(indexURL + "pyodide.js");
  pyodide = await loadPyodide({ indexURL });
}

/**
 * @param {string} code
 * @param {{ ordinal: number, input: string }[]} cases
 */
async function runCases(code, cases) {
  if (!pyodide) {
    throw new Error("Pyodide is not ready");
  }

  /** @type {{ ordinal: number, stdout: string, stderr: string, runtimeMs: number }[]} */
  const results = [];

  for (const testCase of cases) {
    const started = performance.now();
    let stdout = "";
    let stderr = "";

    try {
      const dictCtor = pyodide.globals.get("dict");
      const ns = dictCtor();
      dictCtor.destroy();
      ns.set("__builtins__", pyodide.globals.get("__builtins__"));

      ns.set("_ABT_INPUT", testCase.input);
      pyodide.runPython(
        [
          "import sys, io",
          "sys.stdin = io.StringIO(_ABT_INPUT)",
          "sys.stdout = io.StringIO()",
        ].join("\n"),
        { globals: ns },
      );

      try {
        pyodide.runPython(code, { globals: ns });
        stdout = pyodide.runPython("sys.stdout.getvalue()", { globals: ns });
      } catch (err) {
        try {
          stdout = pyodide.runPython("sys.stdout.getvalue()", { globals: ns });
        } catch {
          stdout = "";
        }
        const message = err instanceof Error ? err.message : String(err);
        const lines = message.trim().split("\n");
        stderr = lines[lines.length - 1] ?? message;
      } finally {
        ns.destroy();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const lines = message.trim().split("\n");
      stderr = lines[lines.length - 1] ?? message;
    }

    results.push({
      ordinal: testCase.ordinal,
      stdout: typeof stdout === "string" ? stdout : String(stdout ?? ""),
      stderr,
      runtimeMs: Math.round(performance.now() - started),
    });
  }

  return results;
}

self.onmessage = async (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "boot") {
    try {
      await boot(data.indexURL);
      self.postMessage({ type: "ready" });
    } catch (err) {
      self.postMessage({
        type: "boot-error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (data.type === "run") {
    try {
      const results = await runCases(data.code, data.cases);
      self.postMessage({ type: "results", results });
    } catch (err) {
      self.postMessage({
        type: "results",
        results: (data.cases ?? []).map((c) => ({
          ordinal: c.ordinal,
          stdout: "",
          stderr: err instanceof Error ? err.message : String(err),
          runtimeMs: 0,
        })),
      });
    }
  }
};
