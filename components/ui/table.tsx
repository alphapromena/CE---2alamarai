import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  /**
   * When true (default), the first 8 body rows stagger-fade in on mount via
   * the [data-stagger="true"] CSS rule in globals.css. The animation is
   * gated by motion-safe — users with prefers-reduced-motion see instant
   * rendering. Pass `stagger={false}` for tables that re-render frequently
   * (e.g. live realtime views) so the animation doesn't replay.
   */
  stagger?: boolean;
}

export function Table({ className, stagger = true, ...props }: TableProps) {
  // Two-wrapper layout: outer div keeps the rounded-xl + border + shadow for
  // the card look; inner div scrolls horizontally when a wide table (6+
  // columns, typical of admin/supervisor views) doesn't fit the viewport.
  // Without this, tables overflow the viewport on phones and break the
  // whole page layout.
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-card">
      <div className="overflow-x-auto">
        <table
          data-stagger={stagger ? 'true' : 'false'}
          className={cn('w-full border-collapse text-sm', className)}
          {...props}
        />
      </div>
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        'bg-bg-subtle text-xs font-semibold uppercase tracking-wide text-fg-muted',
        className,
      )}
      {...props}
    />
  );
}

export function TBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export interface TRProps extends React.HTMLAttributes<HTMLTableRowElement> {
  /** When true, the row shows a pointer cursor — use for rows that navigate on click. */
  interactive?: boolean;
}

export function TR({ className, interactive, ...props }: TRProps) {
  return (
    <tr
      className={cn(
        'group border-t border-border transition-colors duration-150 hover:bg-bg-subtle',
        interactive ? 'cursor-pointer' : '',
        className,
      )}
      {...props}
    />
  );
}

export interface THProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
  /** Data-direction consumer — "asc" default, "desc" rotates the chevron 180°. */
  sortDirection?: 'asc' | 'desc' | null;
}

export function TH({ className, numeric, sortDirection, ...props }: THProps) {
  return (
    <th
      scope="col"
      data-direction={sortDirection ?? undefined}
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
        'px-4 py-3 align-middle',
        numeric ? 'text-end font-medium tabular-nums' : 'text-start',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Matches the column rhythm of a real table. Render 5 of these inside a
 * <TBody> while the data is loading.
 */
export interface TableRowSkeletonProps {
  columns: number;
  /** Index for alternating width variation — pass the map index. */
  index?: number;
}

export function TableRowSkeleton({ columns, index = 0 }: TableRowSkeletonProps) {
  // Cycle through three width classes so skeletons don't line up identically.
  const widthCycle = ['w-32', 'w-24', 'w-40'];
  return (
    <tr className="border-t border-border">
      {Array.from({ length: columns }, (_, i) => (
        <td key={i} className="px-4 py-3">
          <div
            className={cn(
              'h-4 animate-pulse rounded bg-bg-muted',
              widthCycle[(i + index) % widthCycle.length],
            )}
          />
        </td>
      ))}
    </tr>
  );
}
