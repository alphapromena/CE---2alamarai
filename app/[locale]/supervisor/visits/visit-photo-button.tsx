'use client';

import { useEffect, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';

export function VisitPhotoButton({
  path,
  label,
  dialogTitle,
}: {
  path: string;
  label: string;
  dialogTitle: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="ghost" size="sm" type="button" onClick={() => setOpen(true)} aria-label={label}>
        <Camera className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </Button>
      {open ? (
        <VisitPhotoDialog path={path} onClose={() => setOpen(false)} title={dialogTitle} />
      ) : null}
    </>
  );
}

function VisitPhotoDialog({
  path,
  onClose,
  title,
}: {
  path: string;
  onClose: () => void;
  title: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/supervisor-visits/photo-url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { url: string }) => {
        if (!cancelled) setUrl(body.url);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={title} closeLabel="Close" size="lg">
      {error ? (
        <Alert variant="danger" title={error} />
      ) : url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="mx-auto max-h-[70vh] rounded-md" />
      ) : (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-fg-muted" aria-hidden />
        </div>
      )}
    </Dialog>
  );
}
