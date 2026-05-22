'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import {
  Home, Calendar, ListChecks, Archive, Settings,
  Plus, Video, LogOut,
} from 'lucide-react';
import { Logo } from './ui/logo';
import { Avatar } from './ui/avatar';
import { NotificationBell } from './notifications';

const NAV_ITEMS = [
  { id: '/', label: 'Дашборд', icon: Home, adminOnly: false },
  { id: '/calendar', label: 'Календар', icon: Calendar, adminOnly: false },
  { id: '/tasks', label: 'Таски', icon: ListChecks, adminOnly: false },
  { id: '/archive', label: 'Архів', icon: Archive, adminOnly: false },
  { id: '/settings', label: 'Налаштування', icon: Settings, adminOnly: false },
];

export function Sidebar({ workspaceName }: { workspaceName?: string }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside
      className="desktop-sidebar"
      style={{
        width: 240,
        borderRight: '1px solid var(--border)',
        background: 'var(--bg)',
        /* display via CSS */
        /* flexDirection via CSS */
        /* padding via CSS */
        /* gap via CSS */
      }}
    >
      <div style={{ padding: '6px 8px 12px' }}>
        <Logo />
        {workspaceName && (
          <div
            title={workspaceName}
            style={{
              fontSize: 11, color: 'var(--muted)', marginTop: 4, paddingLeft: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {workspaceName}
          </div>
        )}
      </div>

      <Link href="/schedule" className="btn btn-primary" style={{ justifyContent: 'center', marginBottom: 6, fontWeight: 600, textDecoration: 'none' }}>
        <Plus size={16} /> Новий мітинг
      </Link>
      <Link href="/lobby/quick" className="btn" style={{ justifyContent: 'center', marginBottom: 8, fontWeight: 500, textDecoration: 'none' }}>
        <Video size={16} /> Швидкий мітинг
      </Link>

      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0 8px' }} />

      {NAV_ITEMS.map((it) => {
        const active = pathname === it.id || (it.id !== '/' && pathname.startsWith(it.id));
        const Icon = it.icon;
        return (
          <Link
            key={it.id}
            href={it.id}
            className="btn btn-ghost"
            style={{
              padding: '10px 10px',
              justifyContent: 'flex-start',
              borderRadius: 10,
              fontWeight: active ? 600 : 500,
              background: active ? 'var(--surface)' : 'transparent',
              color: active ? 'var(--text)' : 'var(--text-2)',
              border: `1px solid ${active ? 'var(--border)' : 'transparent'}`,
              textDecoration: 'none',
            }}
          >
            <Icon size={17} /> {it.label}
          </Link>
        );
      })}

      <div
        style={{
          marginTop: 'auto',
          borderTop: '1px solid var(--border)',
          paddingTop: 12,
          display: "flex",
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {session?.user && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar name={session.user.name || ''} image={session.user.image} size="md" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {session.user.name}
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 10.5,
                    color: 'var(--muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {session.user.email}
                </div>
              </div>
              <NotificationBell />
              <button
                className="btn btn-ghost btn-icon"
                title="Вийти"
                style={{ width: 30, height: 30 }}
                onClick={() => signOut()}
              >
                <LogOut size={15} />
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
