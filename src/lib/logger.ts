/**
 * Minimal stderr logger for the MCP server.
 *
 * All output goes to stderr so it does not interfere with the stdio MCP
 * protocol stream (which uses stdout). Only info/warn/error levels are
 * emitted; debug is a no-op to keep output quiet during normal use.
 */

export interface Logger {
  info(ctx: Record<string, unknown>, msg: string): void;
  info(msg: string): void;
  debug(ctx: Record<string, unknown>, msg: string): void;
  debug(msg: string): void;
  warn(ctx: Record<string, unknown>, msg: string): void;
  warn(msg: string): void;
  error(ctx: Record<string, unknown>, msg: string): void;
  error(msg: string): void;
  child(ctx: Record<string, unknown>): Logger;
}

function log(level: string, name: string, ctx: Record<string, unknown>, msg: string): void {
  const entry = { level, name, ...ctx, msg, time: new Date().toISOString() };
  process.stderr.write(JSON.stringify(entry) + '\n');
}

function parse(
  nameOrCtx: string | Record<string, unknown>,
  msg: string | undefined,
): [Record<string, unknown>, string] {
  if (typeof nameOrCtx === 'string') return [{}, nameOrCtx];
  return [nameOrCtx, msg ?? ''];
}

export function getLogger(name: string): Logger {
  const make = (extraCtx: Record<string, unknown> = {}): Logger => ({
    info(ctxOrMsg, msg?: string) {
      const [ctx, m] = parse(ctxOrMsg as string | Record<string, unknown>, msg);
      log('info', name, { ...extraCtx, ...ctx }, m);
    },
    debug(_ctxOrMsg, _msg?: string) {
      // no-op
    },
    warn(ctxOrMsg, msg?: string) {
      const [ctx, m] = parse(ctxOrMsg as string | Record<string, unknown>, msg);
      log('warn', name, { ...extraCtx, ...ctx }, m);
    },
    error(ctxOrMsg, msg?: string) {
      const [ctx, m] = parse(ctxOrMsg as string | Record<string, unknown>, msg);
      log('error', name, { ...extraCtx, ...ctx }, m);
    },
    child(ctx) {
      return make({ ...extraCtx, ...ctx });
    },
  });
  return make();
}
