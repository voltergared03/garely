import { Loader2 } from 'lucide-react';
import type { CSSProperties } from 'react';

interface SpinnerProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * A spinning loader icon. Reuses the global `spin` keyframe (globals.css) so we
 * stop re-declaring `@keyframes spin` / inline `animation` across pages.
 */
export function Spinner({ size = 16, className, style }: SpinnerProps) {
  return (
    <Loader2
      size={size}
      className={className ? `spin ${className}` : 'spin'}
      style={style}
      aria-hidden
    />
  );
}
