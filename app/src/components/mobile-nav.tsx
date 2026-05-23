'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Calendar, ListChecks, Archive, Plus } from 'lucide-react';

const NAV = [
  { id: '/', label: 'Головна', icon: Home, adminOnly: false },
  { id: '/calendar', label: 'Календар', icon: Calendar, adminOnly: false },
  { id: '/tasks', label: 'Таски', icon: ListChecks, adminOnly: false },
  { id: '/archive', label: 'Архів', icon: Archive, adminOnly: false },
];

export function MobileNav() {
  const pathname = usePathname();

  const items = NAV;
  const left = items.slice(0, 2);
  const right = items.slice(2, 5);

  return (
    <nav className="mobile-nav">
      {left.map((it) => <NavBtn key={it.id} item={it} active={it.id === '/' ? pathname === '/' : pathname.startsWith(it.id)} />)}
      <Link href="/schedule" className="mobile-nav-fab" aria-label="Новий мітинг">
        <Plus size={22} strokeWidth={2.5} />
      </Link>
      {right.map((it) => <NavBtn key={it.id} item={it} active={pathname.startsWith(it.id)} />)}
    </nav>
  );
}

function NavBtn({ item, active }: { item: typeof NAV[0]; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link href={item.id} className={'mobile-nav-btn' + (active ? ' active' : '')}>
      <Icon size={21} strokeWidth={active ? 2.2 : 1.7} />
      <span>{item.label}</span>
    </Link>
  );
}
