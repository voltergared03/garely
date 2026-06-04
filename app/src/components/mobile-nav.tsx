'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Home, Calendar, ListChecks, Archive, Settings, Plus, Video, Database } from 'lucide-react';
import { useQuizPending } from '@/hooks/use-quiz-pending';

const NAV = [
  { id: '/', key: 'home', icon: Home },
  { id: '/calendar', key: 'calendar', icon: Calendar },
  { id: '/tasks', key: 'tasks', icon: ListChecks },
  { id: '/database', key: 'database', icon: Database },
  { id: '/archive', key: 'archive', icon: Archive },
  { id: '/settings', key: 'settings', icon: Settings },
] as const;

const fabItem: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none',
  color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 999, padding: '8px 8px 8px 16px', boxShadow: '0 8px 24px rgba(0,0,0,.35)',
  fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap',
};
const fabItemIcon = (bg: string): CSSProperties => ({
  width: 36, height: 36, borderRadius: '50%', background: bg, color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
});

export function MobileNav() {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const tr = useTranslations();
  const pendingQuiz = useQuizPending();
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav className="mobile-nav">
        {NAV.map((it) => {
          const Icon = it.icon;
          const active = it.id === '/' ? pathname === '/' : pathname.startsWith(it.id);
          return (
            <Link
              key={it.id}
              href={it.id}
              className={'mobile-nav-btn' + (active ? ' active' : '')}
              aria-label={t(it.key)}
              style={{ position: 'relative' }}
            >
              <Icon size={23} strokeWidth={active ? 2.3 : 1.8} />
              {it.id === '/tasks' && pendingQuiz > 0 && (
                <span style={{
                  position: 'absolute', top: 4, right: '50%', marginRight: -20,
                  minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8,
                  background: 'var(--accent)', color: '#fff', fontSize: 10, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{pendingQuiz}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Floating compose button → speed-dial: quick meeting / schedule */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          aria-hidden
          style={{ position: 'fixed', inset: 0, zIndex: 54, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
        />
      )}
      {open && (
        <div style={{
          position: 'fixed', right: 16, zIndex: 56,
          bottom: 'calc(56px + env(safe-area-inset-bottom, 0px) + 16px + 70px)',
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12,
        }}>
          <Link href="/lobby/quick" onClick={() => setOpen(false)} style={fabItem}>
            <span>{tr('sidebar.quickMeeting')}</span>
            <span style={fabItemIcon('var(--accent)')}><Video size={18} /></span>
          </Link>
          <Link href="/schedule" onClick={() => setOpen(false)} style={fabItem}>
            <span>{tr('dashboard.scheduleMeeting')}</span>
            <span style={fabItemIcon('var(--green, #10b981)')}><Plus size={18} /></span>
          </Link>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="mobile-nav-fab"
        aria-label={t('newMeeting')}
        aria-expanded={open}
        style={{ border: 'none', cursor: 'pointer', padding: 0, zIndex: open ? 56 : undefined }}
      >
        <Plus size={24} strokeWidth={2.5} style={{ transition: 'transform .18s', transform: open ? 'rotate(45deg)' : 'none' }} />
      </button>
    </>
  );
}
