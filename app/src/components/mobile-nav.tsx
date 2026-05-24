'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Home, Calendar, ListChecks, Archive, Settings, Plus } from 'lucide-react';

const NAV = [
  { id: '/', key: 'home', icon: Home },
  { id: '/calendar', key: 'calendar', icon: Calendar },
  { id: '/tasks', key: 'tasks', icon: ListChecks },
  { id: '/archive', key: 'archive', icon: Archive },
  { id: '/settings', key: 'settings', icon: Settings },
] as const;

export function MobileNav() {
  const pathname = usePathname();
  const t = useTranslations('nav');

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
            >
              <Icon size={23} strokeWidth={active ? 2.3 : 1.8} />
            </Link>
          );
        })}
      </nav>
      {/* Floating compose button — new meeting (X-style, sits above the bar) */}
      <Link href="/schedule" className="mobile-nav-fab" aria-label={t('newMeeting')}>
        <Plus size={24} strokeWidth={2.5} />
      </Link>
    </>
  );
}
