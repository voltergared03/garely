import type { NextRequest } from 'next/server';
import { logger } from './logger';
import { jsonError } from './http';
import { captureException } from './error-tracking';

// Wrap a route handler so an unhandled throw becomes a logged, consistent
// 500 instead of an opaque framework error. 36 of 62 route files currently
// have no try/catch — wrapping them gives uniform error handling + structured
// logs (route/method/path/message/stack) without per-route boilerplate.
//
//   export const POST = withRoute('tasks.create', async (req) => { ... });
//   export const GET  = withRoute('meetings.get', async (req, ctx) => { ... });

type RouteHandler<A extends unknown[]> = (
  req: NextRequest,
  ...args: A
) => Promise<Response> | Response;

export function withRoute<A extends unknown[]>(
  name: string,
  handler: RouteHandler<A>,
): RouteHandler<A> {
  return async (req, ...args) => {
    try {
      return await handler(req, ...args);
    } catch (err) {
      logger.error('route_error', {
        route: name,
        method: req.method,
        path: req.nextUrl?.pathname,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      captureException(err, { route: name, method: req.method, path: req.nextUrl?.pathname });
      return jsonError('internal_error', 500);
    }
  };
}
