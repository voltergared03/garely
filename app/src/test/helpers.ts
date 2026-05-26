// Shared test utilities for route/unit tests (used from Phase 2 onward).
// Imports only production deps, so it stays type-checked by the build.
import { NextRequest } from 'next/server';
import type { Session } from 'next-auth';

/** A fake authenticated session. Override any user field per test. */
export function mockSession(overrides: Partial<Session['user']> = {}): Session {
  return {
    user: {
      id: 'user-test',
      role: 'member',
      status: 'active',
      mustChangePassword: false,
      name: 'Test User',
      email: 'test@example.com',
      image: null,
      ...overrides,
    },
    expires: new Date(Date.now() + 3_600_000).toISOString(),
  };
}

/** Build a NextRequest for invoking a route handler directly in a test. */
export function jsonReq(
  method: string,
  body?: unknown,
  url = 'http://localhost/api/test',
): NextRequest {
  return new NextRequest(new URL(url), {
    method,
    ...(body !== undefined
      ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  });
}

/** Wrap dynamic route params the way Next 15 passes them (as a Promise). */
export function ctx<T extends Record<string, string>>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}
