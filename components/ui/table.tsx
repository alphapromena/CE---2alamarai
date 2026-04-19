import * as React from 'react';
import { cn } from '@/lib/utils';

export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white">
      <table className={cn('w-full border-collapse text-sm', className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        'bg-bg-subtle text-xs font-medium uppercase tracking-wide text-fg-secondary',
        className,
      )}
      {...props}
    />
  );
}

export function TBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('hover:bg-bg-subtle/50 group border-t border-border', className)}
      {...props}
    />
  );
}

export interface THProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
}

export function TH({ className, numeric, ...props }: THProps) {
  return (
    <th
      scope="col"
      className={cn('px-4 py-2.5', numeric ? 'text-end' : 'text-start', className)}
      {...props}
    />
  );
}

export interface TDProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
}

export function TD({ className, numeric, ...props }: TDProps) {
  return (
    <td
      className={cn(
        'px-4 py-3',
        numeric ? 'text-end font-medium tabular-nums' : 'text-start',
        className,
      )}
      {...props}
    />
  );
}
