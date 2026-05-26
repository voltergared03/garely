import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validateBody } from '@/lib/validate';
import { jsonReq } from '@/test/helpers';

const schema = z.object({ title: z.string().min(1), n: z.number().optional() });

describe('validateBody', () => {
  it('returns typed data for a valid body', async () => {
    const r = await validateBody(jsonReq('POST', { title: 'Hi' }), schema);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.title).toBe('Hi');
  });

  it('400 when a required field is missing/invalid', async () => {
    const r = await validateBody(jsonReq('POST', { n: 1 }), schema);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(400);
  });

  it('400 invalid_json for an unparseable body', async () => {
    const r = await validateBody(jsonReq('POST'), schema);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(400);
      expect(await (r.response as Response).json()).toEqual({ error: 'invalid_json' });
    }
  });
});
