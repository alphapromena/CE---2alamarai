'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';
import { i18n } from '@/lib/validations/i18n';
import { createTaskAction } from './actions';

export interface SupervisorTasksClientProps {
  locale: string;
  locations: { id: string; name_i18n: { ar?: string; en?: string } }[];
  campaigns: { id: string; name_i18n: { ar?: string; en?: string }; status: string }[];
  promoters: {
    id: string;
    full_name: string;
    assigned_locations: string[];
    active: boolean;
  }[];
}

export function SupervisorTasksClient({
  locale,
  locations,
  campaigns,
  promoters,
}: SupervisorTasksClientProps) {
  const t = useTranslations('Supervisor.tasks');
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? '');
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '');
  const [assigneeId, setAssigneeId] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [descEn, setDescEn] = useState('');
  const [descAr, setDescAr] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const eligiblePromoters = useMemo(
    () => promoters.filter((p) => !locationId || p.assigned_locations.includes(locationId)),
    [promoters, locationId],
  );

  const reset = () => {
    setTitleEn('');
    setTitleAr('');
    setDescEn('');
    setDescAr('');
    setDueDate('');
    setAssigneeId('');
  };

  const onSubmit = () => {
    setError(null);
    setSuccess(false);
    if (!campaignId || !locationId || !assigneeId || !titleEn || !titleAr) {
      setError('required');
      return;
    }
    startTransition(async () => {
      const payload = {
        idempotency_key: crypto.randomUUID(),
        campaign_id: campaignId,
        location_id: locationId,
        assigned_to_user_id: assigneeId,
        title_i18n: { en: titleEn, ar: titleAr },
        description_i18n:
          descEn || descAr
            ? { en: descEn || undefined, ar: descAr || undefined }
            : undefined,
        due_date: dueDate || undefined,
      };
      const res = await createTaskAction(payload);
      if (res.error) {
        setError(res.error);
      } else {
        setSuccess(true);
        reset();
      }
    });
  };

  return (
    <div className="rounded-lg border border-border p-4">
      {error ? (
        <Alert variant="danger" className="mb-3">
          {t(`errors.${error}`, { fallback: error })}
        </Alert>
      ) : null}
      {success ? (
        <Alert variant="success" className="mb-3">
          {t('create_success')}
        </Alert>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>{t('form.campaign')}</Label>
          <Select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {i18n(c.name_i18n, locale)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{t('form.location')}</Label>
          <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {i18n(l.name_i18n, locale)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{t('form.assignee')}</Label>
          <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">{t('form.pick_assignee')}</option>
            {eligiblePromoters.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{t('form.due_date')}</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div>
          <Label>{t('form.title_en')}</Label>
          <Input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
        </div>
        <div>
          <Label>{t('form.title_ar')}</Label>
          <Input value={titleAr} onChange={(e) => setTitleAr(e.target.value)} dir="rtl" />
        </div>
        <div>
          <Label>{t('form.desc_en')}</Label>
          <Textarea value={descEn} onChange={(e) => setDescEn(e.target.value)} rows={2} />
        </div>
        <div>
          <Label>{t('form.desc_ar')}</Label>
          <Textarea value={descAr} onChange={(e) => setDescAr(e.target.value)} rows={2} dir="rtl" />
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button type="button" onClick={onSubmit} disabled={pending}>
          {pending ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
          {t('create')}
        </Button>
      </div>
    </div>
  );
}
