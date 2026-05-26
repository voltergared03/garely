'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { UsageRow } from '../components/shared';

export function BillingTab() {
  const t = useTranslations();
  const [usage, setUsage] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/settings/usage')
      .then(r => r.json())
      .then(data => { if (!data.error) setUsage(data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>{t('common.loading')}</div>;
  if (!usage) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>{t('settings.loadDataFailed')}</div>;

  const costs = usage.costs || {};
  const totalCost = costs.total || 0;
  const uahRate = 41.5;
  const meetingsPct = Math.min(100, (usage.meetings?.thisMonth || 0) * 2);
  const hoursPct = Math.min(100, (usage.hours?.thisMonth || 0) * 2);
  const aiPct = Math.min(100, (usage.actionItems?.thisMonth || 0) / 2);
  const emailPct = usage.emails?.limit ? Math.round((usage.emails.thisMonth / usage.emails.limit) * 100) : 0;

  // Format cost with enough precision
  const fmtCost = (v: number) => {
    if (v === 0) return '$0.00';
    if (v < 0.01) return '$' + v.toFixed(4);
    if (v < 0.10) return '$' + v.toFixed(3);
    return '$' + v.toFixed(2);
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div className="billing-grid" style={{ display: 'grid', gap: 18 }}>
        <div className="card" style={{
          padding: 24, gridColumn: '1 / -1',
          background: 'linear-gradient(135deg, color-mix(in oklab, var(--accent) 14%, var(--surface)) 0%, var(--surface) 60%)',
          borderColor: 'color-mix(in oklab, var(--accent) 25%, var(--border))',
        }}>
          <div style={{ fontSize: 11.5, color: 'var(--accent-2)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, marginBottom: 8 }}>{t('settings.costThisMonth')}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: '-0.02em' }}>{fmtCost(totalCost)}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('settings.costApprox', { amount: (totalCost * uahRate < 1 ? (totalCost * uahRate).toFixed(2) : Math.round(totalCost * uahRate)) })}</div>
          </div>
          <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--text-2)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span>DeepSeek {fmtCost(costs.deepseek || 0)}</span>
            <span>Deepgram {fmtCost(costs.deepgram || 0)}</span>
            {(usage.ai?.costPerReport > 0) && <span style={{ color: 'var(--muted)' }}>{t('settings.costPerReport', { amount: fmtCost(usage.ai.costPerReport) })}</span>}
          </div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 14 }}>{t('settings.thisMonth')}</div>
          <UsageRow label={t('settings.meetingsHeld')} value={String(usage.meetings?.thisMonth || 0)} pct={meetingsPct} />
          <UsageRow label={t('settings.hoursRecorded')} value={String(usage.hours?.thisMonth || 0)} pct={hoursPct} />
          <UsageRow label="Action items" value={String(usage.actionItems?.thisMonth || 0)} pct={aiPct} />
          <UsageRow label="Email" value={(usage.emails?.thisMonth || 0) + ' / ' + (usage.emails?.limit || 3000)} pct={emailPct} />
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 14 }}>{t('settings.aiAnalytics')}</div>
          <UsageRow label={t('settings.aiReports')} value={String(usage.ai?.reportsGenerated || 0)} pct={Math.min(100, (usage.ai?.reportsGenerated || 0) * 5)} />
          <UsageRow label={t('settings.tokensInput')} value={((usage.ai?.tokensInput || 0) / 1000).toFixed(1) + 'K'} pct={Math.min(100, (usage.ai?.tokensInput || 0) / 10000)} />
          <UsageRow label={t('settings.tokensOutput')} value={((usage.ai?.tokensOutput || 0) / 1000).toFixed(1) + 'K'} pct={Math.min(100, (usage.ai?.tokensOutput || 0) / 5000)} />
          <UsageRow label={t('settings.transcriptions')} value={String(usage.transcriptSegments?.thisMonth || 0)} pct={Math.min(100, (usage.transcriptSegments?.thisMonth || 0) / 10)} />
          <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
            {t('settings.totalsLine', { meetings: usage.meetings?.total || 0, tasks: usage.actionItems?.total || 0, users: usage.users || 0 })}
          </div>
        </div>
      </div>
    </div>
  );
}
