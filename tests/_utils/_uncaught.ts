import type process from "node:process"

// Portable helper that returns a promise resolving with the first unhandled
// error (or `null` if none occurred within this tick).
export function captureUnhandledOnce() {
  const _process = (globalThis as unknown as { process: typeof process })?.process;
  return new Promise<ErrorEvent | Error | null>((resolve) => {
    function done<T>(err?: ErrorEvent | Error | null) {
      cleanup();
      resolve(err ?? null);
    }

    function cleanup() {
      if (typeof _process !== "undefined" && _process?.removeListener) {
        _process.removeListener("uncaughtException", nodeHandler);
      }
      
      globalThis.removeEventListener?.("error", domHandler as EventListener);
    }

    function nodeHandler(err: Error) {
      done(err);
      // prevent Jest/Vitest default handler from failing the run
    }

    function domHandler(ev: ErrorEvent) {
      // In Deno/Bun the native ErrorEvent carries the thrown value
      done(ev.error ?? ev);
      ev.preventDefault?.(); // avoid noisy console
    }

    if (typeof _process !== "undefined" && _process?.once) {
      _process.once("uncaughtException", nodeHandler);
    }

    // Deno & Bun (and modern Node with ‑‑experimental‑global‑fetch) share the
    // standard “error” event name on globalThis
    globalThis.addEventListener?.("error", domHandler as EventListener, {
      once: true,
    });
  });
}