'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Link, useRouter } from '@/i18n/navigation';
import { correctMovementAction } from '@/app/[locale]/admin/stock/actions';
import type { StockMovementListRow } from '@/lib/queries/stock';

export interface CorrectMovementFormProps {
  original: StockMovementListRow;
}

/**
 * Admin correction form (D-008). Takes a NEW quantity and inserts both a
 * reversal + a corrected restatement via correct_stock_movement RPC. The
 * original row stays in place — the ledger is append-only.
 */
export function CorrectMovementForm({ original }: CorrectMovementFormProps) {
  const t = useTranslations('Admin.stock.correct');
  const tErrors = useTranslations('Admin.stock.errors');
  const router = useRouter();

  const [newQuantity, setNewQuantity] = useState<string>(String(original.quantity));
  const [reason, setReason] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const disabled =
    pending || !newQuantity || Number(newQuantity) === original.quantity;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const qty = Number(newQuantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('invalid_input');
      return;
    }
    const idempotency_key = crypto.randomUUID();
    startTransition(async () => {
      const res = await correctMovementAction({
        idempotency_key,
        original_movement_id: original.id,
        new_quantity: qty,
        reason: reason.trim() || undefined,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      router.push('/admin/stock/audit');
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-6">
      <Alert variant="warning">
        <AlertTriangle className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        {t('d008_notice')}
      </Alert>

      {error ? <Alert variant="danger">{tErrors(error)}</Alert> : null}

      <div className="rounded-md border border-border bg-bg-subtle p-4">
        <p className="text-xs text-fg-muted">{t('original_label')}</p>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-fg-secondary">{t('field_id')}</dt>
          <dd className="font-mono text-xs">{original.id.slice(0, 8)}</dd>
          <dt className="text-fg-secondary">{t('field_kind')}</dt>
          <dd>{original.movement_kind}</dd>
          <dt className="text-fg-secondary">{t('field_flow')}</dt>
          <dd className="text-xs">
            {original.from_entity_type} → {original.to_entity_type}
          </dd>
          <dt className="text-fg-secondary">{t('field_quantity')}</dt>
          <dd className="font-mono font-semibold">{original.quantity}</dd>
        </dl>
      </div>

      <div>
        <Label htmlFor="new_quantity" required>
          {t('new_quantity_label')}
        </Label>
        <Input
          id="new_quantity"
          type="number"
          inputMode="numeric"
          min={1}
          max={1_000_000}
          dir="ltr"
          value={newQuantity}
          onChange={(e) => setNewQuantity(e.target.value)}
          required
        />
        <p className="mt-1 text-xs text-fg-muted">{t('new_quantity_help')}</p>
      </div>

      <div>
        <Label htmlFor="reason">{t('reason_label')}</Label>
        <Textarea
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder={t('reason_placeholder')}
        />
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-6">
        <Button asChild variant="ghost" type="button" disabled={pending}>
          <Link href="/admin/stock/audit">{t('cancel_cta')}</Link>
        </Button>
        <Button type="submit" variant="destructive" disabled={disabled}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} /> : null}
          {pending ? t('submit_loading') : t('submit_cta')}
        </Button>
      </div>
    </form>
  );
}
