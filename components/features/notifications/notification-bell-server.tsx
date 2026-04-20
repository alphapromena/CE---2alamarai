import { getLocale } from 'next-intl/server';
import { getSessionProfile } from '@/lib/auth/session';
import { getMyUnreadCount, listMyNotifications } from '@/lib/queries/notifications';
import { NotificationBell } from './notification-bell';

/**
 * Server entry for the header bell. Fetches the caller's latest 30
 * notifications + unread count, then hands off to the client component that
 * subscribes to Realtime and wires the mark-read actions.
 */
export async function NotificationBellServer() {
  const profile = await getSessionProfile();
  if (!profile) return null;
  const locale = await getLocale();
  const [items, unread] = await Promise.all([
    listMyNotifications(30),
    getMyUnreadCount(),
  ]);
  return (
    <NotificationBell
      userId={profile.id}
      initialItems={items}
      initialUnread={unread}
      locale={locale}
    />
  );
}
