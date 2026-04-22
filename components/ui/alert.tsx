import * as React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

const VARIANT_STYLES: Record<AlertVariant, string> = {
  info: 'border-info-border bg-info-subtle text-info',
  success: 'border-success-border bg-success-subtle text-success',
  warning: 'border-warning-border bg-warning-subtle text-warning',
  danger: 'border-danger-border bg-danger-subtle text-danger',
};

const VARIANT_ICON: Record<AlertVariant, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
};

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
  icon?: LucideIcon | null;
}

export function Alert({
  className,
  variant = 'info',
  title,
  icon,
  children,
  ...props
}: AlertProps) {
  const Icon = icon === null ? null : (icon ?? VARIANT_ICON[variant]);
  return (
    <div
      role={variant === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex gap-2 rounded-xl border p-4 text-sm shadow-sm motion-safe:animate-fade-up',
        VARIANT_STYLES[variant],
        className,
      )}
      {...props}
    >
      {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden /> : null}
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={cn(title && 'mt-0.5')}>{children}</div> : null}
      </div>
    </div>
  );
}
