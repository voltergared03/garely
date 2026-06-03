import { describe, it, expect } from 'vitest';
import { pickEmailRecipients } from '@/lib/task-notify';

const u = (id: string, email: string | null, preferences: Record<string, unknown> = {}) => ({ id, email, preferences });

describe('pickEmailRecipients', () => {
  it('excludes the actor (no self-notification)', () => {
    expect(pickEmailRecipients([u('a', 'a@x'), u('b', 'b@x')], 'a')).toEqual(['b@x']);
  });

  it('excludes users without an email', () => {
    expect(pickEmailRecipients([u('b', null)], 'a')).toEqual([]);
  });

  it('excludes users who muted task notifications (actionItemNotif=false)', () => {
    expect(pickEmailRecipients([u('b', 'b@x', { actionItemNotif: false })], 'a')).toEqual([]);
  });

  it('includes users with actionItemNotif true or unset', () => {
    expect(pickEmailRecipients([u('b', 'b@x', { actionItemNotif: true }), u('c', 'c@x')], 'a').sort()).toEqual(['b@x', 'c@x']);
  });

  it('dedupes repeated addresses', () => {
    expect(pickEmailRecipients([u('b', 'same@x'), u('c', 'same@x')], 'a')).toEqual(['same@x']);
  });
});
