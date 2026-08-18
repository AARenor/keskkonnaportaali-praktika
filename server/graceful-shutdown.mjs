function boundedMilliseconds(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(Math.trunc(parsed), maximum));
}

export function createGracefulShutdown(server, options = {}) {
  const drainDelayMs = boundedMilliseconds(options.drainDelayMs, 5_000, 0, 15_000);
  const forceExitMs = boundedMilliseconds(options.forceExitMs, 28_000, drainDelayMs + 100, 29_000);
  const idleSweepMs = boundedMilliseconds(options.idleSweepMs, 100, 5, 1_000);
  const exit = options.exit || ((code) => process.exit(code));
  const log = options.log || ((entry) => process.stdout.write(`${JSON.stringify(entry)}\n`));
  const onDrainStart = options.onDrainStart || (() => undefined);
  let state = "running";

  function shutdown(signal = "SIGTERM") {
    if (state !== "running") return false;
    state = "draining";
    onDrainStart(signal);
    log({ event: "graceful-shutdown-started", signal, drainDelayMs, forceExitMs });

    const forceTimer = setTimeout(() => {
      if (state === "finished") return;
      state = "forced";
      if (idleSweep) clearInterval(idleSweep);
      server.closeAllConnections?.();
      log({ event: "graceful-shutdown-forced", signal });
      exit(1);
    }, forceExitMs);
    forceTimer.unref?.();

    let idleSweep = null;
    const drainTimer = setTimeout(() => {
      server.close((error) => {
        if (state === "forced" || state === "finished") return;
        state = "finished";
        clearTimeout(forceTimer);
        if (idleSweep) clearInterval(idleSweep);
        log({ event: "graceful-shutdown-finished", signal, error: error ? error.name || "Error" : null });
        exit(error ? 1 : 0);
      });
      if (typeof server.closeIdleConnections === "function") {
        server.closeIdleConnections();
        idleSweep = setInterval(() => server.closeIdleConnections(), idleSweepMs);
        idleSweep.unref?.();
      }
    }, drainDelayMs);
    drainTimer.unref?.();
    return true;
  }

  return {
    shutdown,
    state: () => state,
  };
}
