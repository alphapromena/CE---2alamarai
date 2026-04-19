'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Link, useRouter } from '@/i18n/navigation';
import type { CampaignRow } from '@/lib/queries/campaigns';
import type { EntityLabelRow } from '@/lib/queries/stock';
import { i18n as pickI18n } from '@/lib/validations/i18n';
import { returnToSupervisorAction } from '@/app/[locale]/promoter/stock/actions';

export interface ReturnToSupervisorFormProps {
  locale: string;
  campaigns: CampaignRow[];
  supervisors: EntityLabelRow[];
  locations: EntityLabelRow[];
  skusByCampaign: Record<string, EntityLabelRow[]>;
}

/**
 * Promoter → supervisor return. Uses useTransition + typed Server Action
 * so zod .strict() sees exactly the schema we declared.
 */
export function ReturnToSupervisorForm({
  locale,
  campaigns,
  supervisors,
  locations,
  skusByCampaign,
}: ReturnToSupervisorFormProps) {
  const t = useTranslations('Promoter.stock.return_form');
  const tErrors = useTranslations('Promoter.stock.errors');
  const router = useRouter();

  const [campaignId, setCampaignId] = useState<string>(campaigns[0]?.id ?? '');
  const [skuId, setSkuId] = useState('');
  const [supervisorId, setSupervisorId] = useState<string>(supervisors[0]?.id ?? '');
  const [locationId, setLocationId] = useState<string>(locations[0]?.id ?? '');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const skus = skusByCampaign[campaignId] ?? [];
  const disabled =
    pending || !campaignId || !skuId || !supervisorId || !locationId || !quantity;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('invalid_input');
      return;
    }
    const idempotency_key = crypto.randomUUID();
    startTransition(async () => {
      const res = await returnToSupervisorAction({
        idempotency_key,
        campaign_id: campaignId,
        sku_id: skuId,
        supervisor_id: supervisorId,
        location_id: locationId,
        quantity: qty,
        reason: reason.trim() || undefined,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      router.push('/promoter/stock');
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-6">
      {error ? <Alert variant="danger">{tErrors(error)}</Alert> : null}

      <div>
        <Label htmlFor="campaign" required>
          {t('campaign_label')}
        </Label>
        <Select
          id="campaign"
          value={campaignId}
          onChange={(e) => {
            setCampaignId(e.target.value);
            setSkuId('');
          }}
        >
          <option value="">{t('campaign_placeholder')}</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {pickI18n(c.name_i18n, locale)}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="sku" required>
          {t('sku_label')}
        </Label>
        <Select
          id="sku"
          value={skuId}
          onChange={(e) => setSkuId(e.target.value)}
          disabled={!campaignId}
        >
          <option value="">{t('sku_placeholder')}</option>
          {skus.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="supervisor" required>
          {t('supervisor_label')}
        </Label>
        <Select
          id="supervisor"
          value={supervisorId}
          onChange={(e) => setSupervisorId(e.target.value)}
        >
          <option value="">{t('supervisor_placeholder')}</option>
          {supervisors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="location" required>
          {t('location_label')}
        </Label>
        <Select
          id="location"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
        >
          <option value="">{t('location_placeholder')}</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="quantity" required>
          {t('quantity_label')}
        </Label>
        <Input
          id="quantity"
          type="number"
          inputMode="numeric"
          min={1}
          max={1_000_000}
          dir="ltr"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          required
        />
      </div>

      <div>
        <Label htmlFor="reason">{t('reason_label')}</Label>
        <Textarea
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={500}
        />
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-6">
        <Button asChild variant="ghost" type="button" disabled={pending}>
          <Link href="/promoter/stock">{t('cancel_cta')}</Link>
        </Button>
        <Button type="submit" disabled={disabled}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} /> : null}
          {pending ? t('submit_loading') : t('submit_cta')}
        </Button>
      </div>
    </form>
  );
}
