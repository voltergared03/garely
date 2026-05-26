import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { withRoute } from '@/lib/with-route';
import { logger } from '@/lib/logger';

afterEach(() => vi.restoreAllMocks());

const req = () => new NextRequest(new URL('http://localhost/api/x'), { method: 'POST' });

describe('withRoute', () => {
  it('passes the handler response through unchanged', async () => {
    const handler = withRoute('x.ok', async () => new Response('ok', { status: 201 }));
    const res = await handler(req());
    expect(res.status).toBe(201);
    expect(await res.text()).toBe('ok');
  });

  it('forwards extra args (route params) to the handler', async () => {
    let seen: unknown;
    const handler = withRoute(
      'x.params',
      async (_req, ctx: { params: Promise<{ id: string }> }) => {
        seen = await ctx.params;
        return new Response('ok');
      },
    );
    await handler(req(), { params: Promise.resolve({ id: 'm1' }) });
    expect(seen).toEqual({ id: 'm1' });
  });

  it('catches a throw -> 500 { error: internal_error } and logs it', async () => {
    const errSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const handler = withRoute('x.boom', async () => {
      throw new Error('kaboom');
    });
    const res = await handler(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal_error' });
    expect(errSpy).toHaveBeenCalledWith(
      'route_error',
      expect.objectContaining({ route: 'x.boom', message: 'kaboom' }),
    );
  });
});
