export type UserStatus =
  | { kind: 'never'; color: string }
  | { kind: 'online'; color: string }
  | { kind: 'minutes' | 'hours' | 'days'; value: number; color: string };

export function getUserStatus(lastLogin?: string | null): UserStatus {
  if (!lastLogin) return { kind: 'never', color: 'var(--muted)' };
  const diff = Date.now() - new Date(lastLogin).getTime();
  const mins = diff / 60000;
  if (mins < 10) return { kind: 'online', color: 'var(--green)' };
  if (mins < 60) return { kind: 'minutes', value: Math.round(mins), color: 'var(--amber)' };
  const hours = Math.round(mins / 60);
  if (hours < 24) return { kind: 'hours', value: hours, color: 'var(--muted)' };
  const days = Math.round(hours / 24);
  return { kind: 'days', value: days, color: 'var(--muted)' };
}
