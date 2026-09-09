'use client';

import s from './toggle.module.css';

/** A labelled on/off switch row. Keyboard: it is a real button, so Space/Enter flip it. */
export function Toggle({ label, value, onChange, disabled }: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`${s.row}${disabled ? ` ${s.rowDisabled}` : ''}`}>
      <span className={s.label}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        disabled={disabled}
        onClick={() => { if (!disabled) onChange(!value); }}
        className={`${s.track}${value ? ` ${s.trackOn}` : ''}`}
      >
        <span className={`${s.thumb}${value ? ` ${s.thumbOn}` : ''}`} />
      </button>
    </label>
  );
}
