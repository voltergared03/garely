import { NextResponse } from 'next/server';

// Small, consistent helpers for JSON route responses.
//
// `jsonError` is safe to adopt anywhere — the error shape `{ error }` is already
// uniform across the codebase. `jsonOk` standardizes on `{ ok: true, ... }`;
// only adopt it where a route already returns that shape (some routes use
// `{ success: true }` and the frontend depends on the exact key — those should
// be migrated deliberately alongside their tests, not in bulk).

/** Canonical success envelope: `{ ok: true, ...data }`. */
export function jsonOk(
  data: Record<string, unknown> = {},
  init?: number | ResponseInit,
): NextResponse {
  return NextResponse.json(
    { ok: true, ...data },
    typeof init === 'number' ? { status: init } : init,
  );
}

/** Canonical error envelope: `{ error }` with a status (default 400). */
export function jsonError(error: string, status = 400): NextResponse {
  return NextResponse.json({ error }, { status });
}
