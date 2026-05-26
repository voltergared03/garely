'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Globe, Users, Shield, Sparkles, Settings as SettingsIcon,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { ProfileTab } from './tabs/ProfileTab';
import { UsersTab } from './tabs/UsersTab';
import { WorkspaceTab } from './tabs/WorkspaceTab';
import { IntegrationsTab } from './tabs/IntegrationsTab';
import { BillingTab } from './tabs/BillingTab';

/* ── Tabs definition ──────────────────────────── */

type TabKey = 'profile' | 'users' | 'workspace' | 'integrations' | 'billing';

interface TabDef { key: TabKey; labelKey: string; icon: React.ReactNode; adminOnly: boolean }

const TABS: TabDef[] = [
  { key: 'profile', labelKey: 'settings.tabProfile', icon: <SettingsIcon size={14} />, adminOnly: false },
  { key: 'users', labelKey: 'settings.tabUsers', icon: <Users size={14} />, adminOnly: true },
  { key: 'workspace', labelKey: 'settings.tabWorkspace', icon: <Shield size={14} />, adminOnly: true },
  { key: 'integrations', labelKey: 'settings.tabIntegrations', icon: <Globe size={14} />, adminOnly: true },
  { key: 'billing', labelKey: 'settings.tabBilling', icon: <Sparkles size={14} />, adminOnly: true },
];

/* ── Main ─────────────────────────────────────── */

export default function SettingsPage() {
  const tr = useTranslations();
  const { data: session, update: updateSession } = useSession();
  const role = session?.user?.role;
  const isAdmin = role === 'admin';

  const [tab, setTab] = useState<TabKey>('profile');
  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '18px clamp(14px, 4vw, 28px) 0', borderBottom: '1px solid var(--border)' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>{tr('settings.pageTitle')}</h1>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          {isAdmin ? tr('settings.subtitleAdmin') : tr('settings.subtitleUser')}
        </div>
        <div className="admin-tabs" style={{ display: 'flex', gap: 2, marginTop: 18 }}>
          {visibleTabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className="btn btn-ghost" style={{
              padding: '10px 16px', borderRadius: 0, flexShrink: 0, whiteSpace: 'nowrap',
              borderBottom: '2px solid ' + (tab === t.key ? 'var(--accent)' : 'transparent'),
              color: tab === t.key ? 'var(--text)' : 'var(--muted)',
              fontWeight: tab === t.key ? 600 : 500,
            }}>
              {t.icon} {tr(t.labelKey)}
            </button>
          ))}
        </div>
      </div>
      <div className="page-container" style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'profile' && <ProfileTab session={session} updateSession={updateSession} />}
        {tab === 'users' && isAdmin && <UsersTab />}
        {tab === 'workspace' && isAdmin && <WorkspaceTab />}
        {tab === 'integrations' && isAdmin && <IntegrationsTab />}
        {tab === 'billing' && isAdmin && <BillingTab />}
      </div>
    </div>
  );
}
