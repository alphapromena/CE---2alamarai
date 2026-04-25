import {
  Activity,
  ClipboardCheck,
  FileText,
  MapPin,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

export type ActivityEventType = 'check-in' | 'visit' | 'report';

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  timestamp: string;
  actorName: string | null;
  locationName: string | null;
}

export interface ActivityFeedProps {
  events: ActivityEvent[];
  locale: 'en' | 'ar';
  /** Page-level `now` in ms — passed in to keep this component pure. */
  nowMs: number;
}

const TYPE_TINT: Record<ActivityEventType, string> = {
  'check-in': 'bg-brand-teal/10 text-brand-teal',
  visit: 'bg-warning-subtle text-warning',
  report: 'bg-brand-cyan/10 text-brand-cyan',
};

const TYPE_ICON: Record<ActivityEventType, LucideIcon> = {
  'check-in': ClipboardCheck,
  visit: MapPin,
  report: FileText,
};

const TYPE_KEY: Record<ActivityEventType, 'checkIn' | 'visit' | 'report'> = {
  'check-in': 'checkIn',
  visit: 'visit',
  report: 'report',
};

function formatRelative(
  iso: string,
  nowMs: number,
  locale: 'en' | 'ar',
  justNowLabel: string,
): string {
  const elapsedSec = Math.round((nowMs - new Date(iso).getTime()) / 1000);
  if (elapsedSec < 60) return justNowLabel;
  const rtf = new Intl.RelativeTimeFormat(locale === 'ar' ? 'ar-JO' : 'en', {
    numeric: 'auto',
  });
  const minutes = Math.round(elapsedSec / 60);
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  return rtf.format(-days, 'day');
}

export function ActivityFeed({ events, locale, nowMs }: ActivityFeedProps) {
  const t = useTranslations('Admin.dashboard.activity');

  if (events.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-subtle"
          aria-hidden
        >
          <Activity className="h-5 w-5 text-accent" strokeWidth={1.75} />
        </div>
        <p className="text-sm text-fg-secondary">{t('empty')}</p>
      </div>
    );
  }

  const unknownUser = t('unknownUser');
  const unknownLocation = t('unknownLocation');
  const justNow = t('justNow');

  return (
    <ul
      className="h-full divide-y divide-black/5 overflow-y-auto"
      data-scroll="contain"
    >
      {events.map((e) => {
        const Icon = TYPE_ICON[e.type];
        const tint = TYPE_TINT[e.type];
        const name = e.actorName ?? unknownUser;
        const location = e.locationName ?? unknownLocation;
        const messageKey = `event.${TYPE_KEY[e.type]}` as const;
        const message =
          e.type === 'report'
            ? t(messageKey, { name })
            : t(messageKey, { name, location });
        const timeAgo = formatRelative(e.timestamp, nowMs, locale, justNow);

        return (
          <li
            key={`${e.type}:${e.id}`}
            className="flex items-start gap-3 px-4 py-3"
          >
            <div
              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${tint}`}
              aria-hidden
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg">{message}</p>
              <p className="mt-0.5 text-xs text-fg-muted">{timeAgo}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
