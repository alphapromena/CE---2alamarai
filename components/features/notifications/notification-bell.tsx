'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bell, Check } from 'lucide-react';
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/lib/notifications/actions';
import { useRealtimeTables } from '@/lib/supabase/realtime';
import type { NotificationRow } from '@/lib/queries/notifications';
import { StatusPill } from '@/components/ui/status-pill';

/**
 * Bell icon + popover. Consumes a server-fetched list + unread count and
 * subscribes to Realtime on `notifications` so new rows trigger a
 * router.refresh(). The unread badge animates on count > 0.
 *
 * RLS scopes Realtime deliveries to the caller's rows automatically, so we
 * don't need a channel filter — there's no server-side fan-out of someone
 * else's notifications to worry about.
 */
export function NotificationBell({
  userId,
  initialItems,
  initialUnread,
  locale,
}: {
  userId: string;
  initialItems: NotificationRow[];
  initialUnread: number;
  locale: string;
}) {
  const t = useTranslations('Notifications');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const subs = useMemo(
    () => [
      {
        table: 'notifications',
        // RLS already limits rows to our user_id, but we filter server-side
        // too — fewer delivered events, faster dismiss.
        filter: `user_id=eq.${userId}`,
      },
    ],
    [userId],
  );

  useRealtimeTables(`notifications-${userId}`, subs, () => {
    startTransition(() => router.refresh());
  });

  async function markOne(id: string) {
    const fd = new FormData();
    fd.set('id', id);
    await markNotificationReadAction({ error: null }, fd);
    startTransition(() => router.refresh());
  }

  async function markAll() {
    await markAllNotificationsReadAction();
    startTransition(() => router.refresh());
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={t('title')}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-white hover:bg-bg-hover"
        onClick={() => setOpen((o) => !o)}
      >
        <Bell className="h-4 w-4" strokeWidth={1.75} />
        {initialUnread > 0 ? (
          <span
            className="absolute -end-1 -top-1 inline-flex min-h-[1.25rem] min-w-[1.25rem] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-medium text-white"
            dir="ltr"
          >
            {initialUnread > 99 ? '99+' : initialUnread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute end-0 mt-2 w-80 rounded border border-border bg-white p-2 shadow-sm"
          role="menu"
        >
          <div className="flex items-center justify-between px-2 py-1">
            <p className="text-sm font-semibold">{t('title')}</p>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg disabled:opacity-50"
              onClick={markAll}
              disabled={initialUnread === 0 || isPending}
            >
              <Check className="h-3 w-3" />
              {t('mark_all_read')}
            </button>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {initialItems.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-fg-muted">{t('empty')}</li>
            ) : (
              initialItems.map((n) => (
                <li
                  key={n.id}
                  className={`rounded px-3 py-2 ${n.read_at ? '' : 'bg-bg-muted'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <StatusPill
                      variant="info"
                      label={t(`kind.${n.kind}`)}
                    />
                    <span className="text-xs text-fg-muted" dir="ltr">
                      {new Date(n.created_at).toLocaleTimeString(locale === 'ar' ? 'ar-JO' : 'en-JO', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  {!n.read_at ? (
                    <button
                      type="button"
                      className="mt-1 text-xs text-fg-secondary hover:text-fg"
                      onClick={() => markOne(n.id)}
                    >
                      {t('mark_read')}
                    </button>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

