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
import { reallocateStockAction } from '@/app/[locale]/supervisor/stock/actions';

export interface ReallocateStockFormProps {
  locale: string;
  actorId: string;
  campaigns: CampaignRow[];
  otherSupervisors: EntityLabelRow[];
  locations: EntityLabelRow[];
  skusByCampaign: Record<string, EntityLabelRow[]>;
}

/**
 * Supervisor reallocation. Two modes, selected by radio:
 *   - supervisor → supervisor (from = self, pick a peer)
 *   - location → location (pick two assigned locations)
 *
 * The RPC itself re-checks authz; this form only narrows the UX.
 */
export function ReallocateStockForm({
  locale,
  actorId,
  campaigns,
  otherSupervisors,
  locations,
  skusByCampaign,
}: ReallocateStockFormProps) {
  const t = useTranslations('Supervisor.stock.reallocate_form');
  const tErrors = useTranslations('Supervisor.stock.errors');
  const router = useRouter();

  const [mode, setMode] = useState<'supervisor' | 'location'>('supervisor');
  const [campaignId, setCampaignId] = useState<string>(campaigns[0]?.id ?? '');
  const [skuId, setSkuId] = useState('');
  const [toSupervisorId, setToSupervisorId] = useState('');
  const [fromLocationId, setFromLocationId] = useState(locations[0]?.id ?? '');
  const [toLocationId, setToLocationId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const skus = skusByCampaign[campaignId] ?? [];
  const disabled =
    pending ||
    !campaignId ||
    !skuId ||
    !quantity ||
    (mode === 'supervisor' ? !toSupervisorId : !fromLocationId || !toLocationId || fromLocationId === toLocationId);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('invalid_input');
      return;
    }
    const idempotency_key = crypto.randomUUID();
    const payload =
      mode === 'supervisor'
        ? {
            idempotency_key,
            campaign_id: campaignId,
            sku_id: skuId,
            from_entity_type: 'supervisor' as const,
            from_entity_id: actorId,
            to_entity_type: 'supervisor' as const,
            to_entity_id: toSupervisorId,
            quantity: qty,
            reason: reason.trim() || undefined,
          }
        : {
            idempotency_key,
            campaign_id: campaignId,
            sku_id: skuId,
            from_entity_type: 'location' as const,
            from_entity_id: fromLocationId,
            to_entity_type: 'location' as const,
            to_entity_id: toLocationId,
            location_id: fromLocationId, // audit: where the op happened
            quantity: qty,
            reason: reason.trim() || undefined,
          };
    startTransition(async () => {
      const res = await reallocateStockAction(payload);
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

      <fieldset className="rounded-md border border-border p-4">
        <legend className="px-2 text-sm font-medium">{t('mode_label')}</legend>
        <div className="flex flex-wrap gap-4">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="mode"
              checked={mode === 'supervisor'}
              onChange={() => setMode('supervisor')}
              className="focus:ring-accent/20 h-4 w-4 border-border text-accent focus:ring-2"
            />
            {t('mode_supervisor')}
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="mode"
              checked={mode === 'location'}
              onChange={() => setMode('location')}
              className="focus:ring-accent/20 h-4 w-4 border-border text-accent focus:ring-2"
            />
            {t('mode_location')}
          </label>
        </div>
      </fieldset>

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

      {mode === 'supervisor' ? (
        <div>
          <Label htmlFor="to_sup" required>
            {t('to_supervisor_label')}
          </Label>
          <Select
            id="to_sup"
            value={toSupervisorId}
            onChange={(e) => setToSupervisorId(e.target.value)}
          >
            <option value="">{t('to_supervisor_placeholder')}</option>
            {otherSupervisors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-fg-muted">{t('from_self_note')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="from_loc" required>
              {t('from_location_label')}
            </Label>
            <Select
              id="from_loc"
              value={fromLocationId}
              onChange={(e) => setFromLocationId(e.target.value)}
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
            <Label htmlFor="to_loc" required>
              {t('to_location_label')}
            </Label>
            <Select
              id="to_loc"
              value={toLocationId}
              onChange={(e) => setToLocationId(e.target.value)}
            >
              <option value="">{t('location_placeholder')}</option>
              {locations
                .filter((l) => l.id !== fromLocationId)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
            </Select>
          </div>
        </div>
      )}

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
