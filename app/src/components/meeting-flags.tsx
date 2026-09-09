'use client';

import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Toggle } from '@/components/ui/toggle';
import type { MeetingFlags as Flags } from '@/lib/meeting-flags';
import s from './meeting-flags.module.css';

/**
 * The "AI and communication" switches for one meeting: live transcription, AI report,
 * task creation, guest access. Used by the create page and by both edit dialogs, so a
 * meeting's settings can be changed after it was scheduled, not only at creation.
 */
export function MeetingFlags({ value, onChange, disabled, hint }: {
  value: Flags;
  onChange: (next: Flags) => void;
  disabled?: boolean;
  hint?: string | null;
}) {
  const t = useTranslations();
  const set = (k: keyof Flags) => (v: boolean) => onChange({ ...value, [k]: v });
  return (
    <div>
      <div className={s.head}>
        <Sparkles size={15} className={s.icon} />
        <div className={s.title}>{t('schedule.aiSectionTitle')}</div>
      </div>
      <Toggle label={t('schedule.toggleTranscription')} value={value.transcription} onChange={set('transcription')} disabled={disabled} />
      <Toggle label={t('schedule.toggleAiReport')} value={value.aiReport} onChange={set('aiReport')} disabled={disabled} />
      <Toggle label={t('schedule.toggleTaskCreation')} value={value.taskCreation} onChange={set('taskCreation')} disabled={disabled} />
      <Toggle label={t('schedule.toggleAllowGuests')} value={value.allowGuests} onChange={set('allowGuests')} disabled={disabled} />
      {hint && <div className={s.hint}>{hint}</div>}
    </div>
  );
}
