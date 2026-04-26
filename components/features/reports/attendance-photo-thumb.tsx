'use client';

import { useEffect, useState } from 'react';

/**
 * Sibling of PhotoThumb specialised for attendance photos. Hits the
 * attendance-specific endpoint (/api/attendance/photo-url) which has its
 * own RLS-aware authorisation; activity photos use a different endpoint.
 */
export function AttendancePhotoThumb({
  path,
  alt,
}: {
  path: string;
  alt: string;
}) {
  const [signed, setSigned] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    (async () => {
      const res = await fetch('/api/attendance/photo-url', {
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

  return signed ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={signed}
      alt={alt}
      className="aspect-square w-full rounded-md border border-border object-cover"
    />
  ) : (
    <div className="aspect-square w-full animate-pulse rounded-md bg-bg-muted" />
  );
}
