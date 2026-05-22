'use client';

import { getAvatarColor, getInitials } from '@/lib/utils';

interface AvatarProps {
  name: string;
  image?: string | null;
  size?: 'sm' | 'md' | 'lg';
  ring?: boolean;
  color?: string;
}

export function Avatar({ name, image, size = 'md', ring, color }: AvatarProps) {
  const bgColor = color || getAvatarColor(name);
  const initials = getInitials(name);
  const cls = size === 'sm' ? 'avatar-sm' : size === 'lg' ? 'avatar-lg' : 'avatar-md';

  if (image) {
    return (
      <img
        src={image}
        alt={name}
        className={cls}
        style={{
          borderRadius: '50%',
          objectFit: 'cover',
          boxShadow: ring ? '0 0 0 2px var(--bg)' : 'none',
        }}
        title={name}
      />
    );
  }

  return (
    <div
      className={`avatar ${cls}`}
      style={{
        background: bgColor,
        boxShadow: ring ? '0 0 0 2px var(--bg)' : 'none',
      }}
      title={name}
    >
      {initials}
    </div>
  );
}

interface AvatarStackProps {
  users: { name: string; image?: string | null }[];
  max?: number;
  size?: 'sm' | 'md';
}

export function AvatarStack({ users, max = 4, size = 'sm' }: AvatarStackProps) {
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;

  return (
    <div style={{ display: 'flex' }}>
      {shown.map((u, i) => (
        <div key={i} style={{ marginLeft: i === 0 ? 0 : -8 }}>
          <Avatar name={u.name} image={u.image} size={size} ring />
        </div>
      ))}
      {rest > 0 && (
        <div
          className={`avatar ${size === 'sm' ? 'avatar-sm' : 'avatar-md'}`}
          style={{
            background: 'var(--surface-3)',
            color: 'var(--text-2)',
            marginLeft: -8,
            boxShadow: '0 0 0 2px var(--bg)',
          }}
        >
          +{rest}
        </div>
      )}
    </div>
  );
}
