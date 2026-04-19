import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StatusPillVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const VARIANT_STYLES: Record<StatusPillVariant, string> = {
  success: 'bg-success-subtle text-success border-success-border',
  warning: 'bg-warning-subtle text-warning border-warning-border',
  danger: 'bg-danger-subtle text-danger border-danger-border',
  info: 'bg-info-subtle text-info border-info-border',
  neutral: 'bg-bg-muted text-fg-secondary border-border',
};

export interface StatusPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant: StatusPillVariant;
  icon?: LucideIcon;
  label: string;
}

export function StatusPill({ variant, icon: Icon, label, className, ...props }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium',
        VARIANT_STYLES[variant],
        className,
      )}
      aria-label={label}
      {...props}
    >
      {Icon ? <Icon className="h-3 w-3" strokeWidth={1.75} aria-hidden /> : null}
      {label}
    </span>
  );
}
