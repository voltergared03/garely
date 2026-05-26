// Minimal structured logger. Emits one JSON line per event to stdout/stderr —
// ideal for `docker logs` and shipping to Loki/etc. Zero-dependency and
// edge-safe (only console + JSON.stringify + Date), so it works in every
// runtime without bundler config.
//
// The shape is pino-compatible (level/time/msg + context), so this can be
// swapped for pino later without touching call sites.

type Level = 'debug' | 'info' | 'warn' | 'error';
type Context = Record<string, unknown>;

function emit(level: Level, msg: string, ctx?: Context): void {
  let line: string;
  try {
    line = JSON.stringify({ level, time: new Date().toISOString(), msg, ...ctx });
  } catch {
    // Circular/unserializable context — fall back to a safe line.
    line = JSON.stringify({ level, time: new Date().toISOString(), msg });
  }
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, ctx?: Context) => emit('debug', msg, ctx),
  info: (msg: string, ctx?: Context) => emit('info', msg, ctx),
  warn: (msg: string, ctx?: Context) => emit('warn', msg, ctx),
  error: (msg: string, ctx?: Context) => emit('error', msg, ctx),
};
