'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status-pill';
import { Alert } from '@/components/ui/alert';
import { i18n } from '@/lib/validations/i18n';
import type { TaskRow } from '@/lib/queries/tasks';
import { markMyTaskStatusAction } from './actions';

function pill(status: TaskRow['status']) {
  switch (status) {
    case 'open':
      return { variant: 'neutral' as const, key: 'status_open' };
    case 'in_progress':
      return { variant: 'info' as const, key: 'status_in_progress' };
    case 'done':
      return { variant: 'success' as const, key: 'status_done' };
    case 'cancelled':
      return { variant: 'danger' as const, key: 'status_cancelled' };
  }
}

export interface PromoterTasksClientProps {
  locale: string;
  tasks: TaskRow[];
  allowComplete: boolean;
}

export function PromoterTasksClient({ locale, tasks, allowComplete }: PromoterTasksClientProps) {
  const t = useTranslations('Promoter.tasks');
  const [pending, startTransition] = useTransition();
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onChange = (id: string, next: 'in_progress' | 'done') => {
    setError(null);
    setWorking(id);
    startTransition(async () => {
      const res = await markMyTaskStatusAction({ id, status: next });
      if (res.error) setError(res.error);
      setWorking(null);
    });
  };

  return (
    <div className="space-y-3">
      {error ? <Alert variant="danger">{t(`errors.${error}`, { fallback: error })}</Alert> : null}
      {tasks.map((task) => {
        const p = pill(task.status);
        return (
          <article key={task.id} className="rounded-lg border border-border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{i18n(task.title_i18n, locale)}</div>
                {task.description_i18n ? (
                  <p className="mt-1 text-xs text-fg-secondary">
                    {i18n(task.description_i18n, locale)}
                  </p>
                ) : null}
                {task.due_date ? (
                  <p className="mt-1 text-xs text-fg-muted">
                    {t('due', { date: task.due_date })}
                  </p>
                ) : null}
              </div>
              <StatusPill variant={p.variant} label={t(p.key)} />
            </div>
            {allowComplete && task.status !== 'done' && task.status !== 'cancelled' ? (
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                {task.status === 'open' ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={pending && working === task.id}
                    onClick={() => onChange(task.id, 'in_progress')}
                  >
                    {pending && working === task.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Circle className="size-3" />
                    )}
                    {t('mark_in_progress')}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={pending && working === task.id}
                  onClick={() => onChange(task.id, 'done')}
                >
                  {pending && working === task.id ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-3" />
                  )}
                  {t('mark_done')}
                </Button>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
