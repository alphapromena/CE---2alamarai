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
import { distributeStockAction } from '@/app/[locale]/supervisor/stock/actions';

export interface DistributeStockFormProps {
  locale: string;
  campaigns: CampaignRow[];
  promoters: EntityLabelRow[];
  locations: EntityLabelRow[];
  skusByCampaign: Record<string, EntityLabelRow[]>;
}

/**
 * Supervisor → promoter distribution. Location is required (used by RLS +
 * dashboard filtering). The from-entity is implicit (the caller's id).
 */
export function DistributeStockForm({
  locale,
  campaigns,
  promoters,
  locations,
  skusByCampaign,
}: DistributeStockFormProps) {
  const t = useTranslations('Supervisor.stock.distribute_form');
  const tErrors = useTranslations('Supervisor.stock.errors');
  const router = useRouter();

  const [campaignId, setCampaignId] = useState<string>(campaigns[0]?.id ?? '');
  const [skuId, setSkuId] = useState('');
  const [promoterId, setPromoterId] = useState('');
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const skus = skusByCampaign[campaignId] ?? [];
  const disabled =
    pending || !campaignId || !skuId || !promoterId || !locationId || !quantity;

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
      const res = await distributeStockAction({
        idempotency_key,
        campaign_id: campaignId,
        sku_id: skuId,
        promoter_id: promoterId,
        location_id: locationId,
        quantity: qty,
        reason: reason.trim() || undefined,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      router.push('/supervisor/stock');
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
        <Label htmlFor="promoter" required>
          {t('promoter_label')}
        </Label>
        <Select
          id="promoter"
          value={promoterId}
          onChange={(e) => setPromoterId(e.target.value)}
        >
          <option value="">{t('promoter_placeholder')}</option>
          {promoters.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
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
          <Link href="/supervisor/stock">{t('cancel_cta')}</Link>
        </Button>
        <Button type="submit" disabled={disabled}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} /> : null}
          {pending ? t('submit_loading') : t('submit_cta')}
        </Button>
      </div>
    </form>
  );
}
