import { Skeleton } from '@/components/ui/skeleton';

/**
 * Generic page-level skeleton used by route-segment `loading.tsx` fallbacks.
 * Mirrors the admin/supervisor/promoter/client page layout: page header,
 * optional filter row, then a table/card body.
 *
 * Variants:
 * - "table"   — header + filter row + table rows (default; fits list pages)
 * - "cards"   — header + grid of cards (fits dashboard / performance / live)
 * - "form"    — header + single stacked form column (fits *new* and *edit* pages)
 */
export function PageSkeleton({ variant = 'table' }: { variant?: 'table' | 'cards' | 'form' }) {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8" aria-busy="true">
      <div className="border-b border-border pb-6">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>

      {variant === 'table' ? (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-bg-subtle p-3">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-8 w-32" />
          </div>
          <div className="mt-6 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </>
      ) : null}

      {variant === 'cards' ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : null}

      {variant === 'form' ? (
        <div className="mt-6 max-w-xl space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-9 w-32" />
        </div>
      ) : null}
    </div>
  );
}
