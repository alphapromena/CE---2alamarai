'use client';

import { RefreshCw } from 'lucide-react';

export function OfflineRetryButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover"
    >
      <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      {label}
    </button>
  );
}
