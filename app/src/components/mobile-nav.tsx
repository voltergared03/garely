'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Calendar, ListChecks, Archive, Settings, Plus } from 'lucide-react';

const NAV = [
  { id: '/', label: 'Головна', icon: Home },
  { id: '/calendar', label: 'Календар', icon: Calendar },
  { id: '/tasks', label: 'Таски', icon: ListChecks },
  { id: '/archive', label: 'Архів', icon: Archive },
  { id: '/settings', label: 'Налаштування', icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <>
      <nav className="mobile-nav">
        {NAV.map((it) => (
          <NavBtn
            key={it.id}
            item={it}
            active={it.id === '/' ? pathname === '/' : pathname.startsWith(it.id)}
          />
        ))}
      </nav>
      {/* Floating compose button — new meeting (X-style, sits above the bar) */}
      <Link href="/schedule" className="mobile-nav-fab" aria-label="Новий мітинг">
        <Plus size={24} strokeWidth={2.5} />
      </Link>
    </>
  );
}

function NavBtn({ item, active }: { item: typeof NAV[0]; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.id}
      className={'mobile-nav-btn' + (active ? ' active' : '')}
      aria-label={item.label}
    >
      <Icon size={23} strokeWidth={active ? 2.3 : 1.8} />
    </Link>
  );
}
