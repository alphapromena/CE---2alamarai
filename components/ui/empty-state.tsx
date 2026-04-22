import * as React from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-white px-6 py-12 text-center shadow-card motion-safe:animate-fade-up',
        className,
      )}
    >
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-subtle">
        <Icon className="h-6 w-6 text-accent" strokeWidth={1.75} aria-hidden />
      </div>
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description ? (
        <p className="mx-auto mt-1 max-w-sm text-sm text-fg-secondary">{description}</p>
      ) : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}
