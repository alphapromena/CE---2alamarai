'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

export function PhotoThumb({ path, kind }: { path: string; kind: string }) {
  const t = useTranslations('Promoter.reports');
  const [signed, setSigned] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    (async () => {
      const res = await fetch('/api/activity-photos/photo-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      if (!aborted && res.ok) {
        const body = (await res.json()) as { url?: string };
        setSigned(body.url ?? null);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [path]);

  const label = t(`photo.${kind as 'setup' | 'during' | 'end_of_shift'}`);
  return (
    <figure className="rounded-lg border border-border p-2">
      <figcaption className="mb-1 text-xs font-medium text-fg-secondary">{label}</figcaption>
      {signed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={signed}
          alt={label}
          className="aspect-square w-full rounded-md border border-border object-cover"
        />
      ) : (
        <div className="aspect-square w-full animate-pulse rounded-md bg-bg-muted" />
      )}
    </figure>
  );
}
