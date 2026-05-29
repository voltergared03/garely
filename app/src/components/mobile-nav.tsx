'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Home, Calendar, ListChecks, Archive, Settings, Plus, ClipboardList } from 'lucide-react';
import { useQuizPending } from '@/hooks/use-quiz-pending';

const NAV = [
  { id: '/', key: 'home', icon: Home },
  { id: '/calendar', key: 'calendar', icon: Calendar },
  { id: '/tasks', key: 'tasks', icon: ListChecks },
  { id: '/quizzes', key: 'quizzes', icon: ClipboardList },
  { id: '/archive', key: 'archive', icon: Archive },
  { id: '/settings', key: 'settings', icon: Settings },
] as const;

export function MobileNav() {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const pendingQuiz = useQuizPending();

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
              {it.id === '/quizzes' && pendingQuiz > 0 && (
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
      {/* Floating compose button — new meeting (X-style, sits above the bar) */}
      <Link href="/schedule" className="mobile-nav-fab" aria-label={t('newMeeting')}>
        <Plus size={24} strokeWidth={2.5} />
      </Link>
    </>
  );
}
