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
import { Link } from '@/i18n/navigation';
import { useRouter } from '@/i18n/navigation';
import type { EntityLabelRow } from '@/lib/queries/stock';
import type { CampaignRow } from '@/lib/queries/campaigns';
import { i18n as pickI18n } from '@/lib/validations/i18n';
import { allocateStockAction } from '@/app/[locale]/admin/stock/actions';

export interface AllocateStockFormProps {
  locale: string;
  campaigns: CampaignRow[];
  supervisors: EntityLabelRow[];
  skusByCampaign: Record<string, EntityLabelRow[]>;
}

/**
 * Admin allocation form — warehouse → supervisor. Client-generates the
 * idempotency_key UUIDv4 on mount. On submit, invokes the Server Action
 * with a typed object (not FormData) so we keep the zod .strict() contract.
 */
export function AllocateStockForm({
  locale,
  campaigns,
  supervisors,
  skusByCampaign,
}: AllocateStockFormProps) {
  const t = useTranslations('Admin.stock.form');
  const tErrors = useTranslations('Admin.stock.errors');
  const router = useRouter();

  const [campaignId, setCampaignId] = useState<string>(campaigns[0]?.id ?? '');
  const [skuId, setSkuId] = useState<string>('');
  const [supervisorId, setSupervisorId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const skus = skusByCampaign[campaignId] ?? [];
  const disabled = pending || !campaignId || !skuId || !supervisorId || !quantity;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('invalid_input');
      return;
    }
    // Fresh UUID per submit attempt — a retry after a validation failure gets
    // a new key; a retry after a NETWORK failure would reuse via the client
    // retrying the same startTransition (not in scope yet).
    const idempotency_key = crypto.randomUUID();
    startTransition(async () => {
      const res = await allocateStockAction({
        idempotency_key,
        campaign_id: campaignId,
        sku_id: skuId,
        supervisor_id: supervisorId,
        quantity: qty,
        reason: reason.trim() || undefined,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      router.push('/admin/stock');
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
        <Select id="sku" value={skuId} onChange={(e) => setSkuId(e.target.value)} disabled={!campaignId}>
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
        <p className="mt-1 text-xs text-fg-muted">{t('quantity_help')}</p>
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
          <Link href="/admin/stock">{t('cancel_cta')}</Link>
        </Button>
        <Button type="submit" disabled={disabled}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} /> : null}
          {pending ? t('submit_loading') : t('submit_cta')}
        </Button>
      </div>
    </form>
  );
}
