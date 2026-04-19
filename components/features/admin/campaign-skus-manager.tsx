'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { I18nField, type I18nValue } from '@/components/ui/i18n-field';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import {
  createSkuAction,
  updateSkuAction,
  deleteSkuAction,
  type ChildActionState,
} from '@/app/[locale]/admin/campaigns/actions';
import type { CampaignSkuRow } from '@/lib/queries/campaigns';
import { i18n as pickI18n } from '@/lib/validations/i18n';

export interface CampaignSkusManagerProps {
  campaignId: string;
  rows: CampaignSkuRow[];
  locale: string;
}

const initialState: ChildActionState = { error: null };

export function CampaignSkusManager({ campaignId, rows, locale }: CampaignSkusManagerProps) {
  const t = useTranslations('Admin.campaigns.skus_panel');
  const tCommon = useTranslations('Admin.common');
  const tI18nField = useTranslations('Admin.i18n_field');

  const [createState, createAction, createPending] = useActionState(createSkuAction, initialState);
  const [, deleteAction] = useActionState(deleteSkuAction, initialState);

  const [name, setName] = useState<I18nValue>({ en: '', ar: '' });
  const [unit, setUnit] = useState<I18nValue>({ en: '', ar: '' });
  const [target, setTarget] = useState('0');
  const [stock, setStock] = useState('0');

  const errorMessage = createState.error ? tCommon('errors.unknown') : null;

  return (
    <div className="space-y-6">
      {rows.length === 0 ? (
        <p className="text-sm text-fg-muted">{t('empty')}</p>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>{t('columns.name')}</TH>
              <TH>{t('columns.unit')}</TH>
              <TH numeric>{t('columns.target')}</TH>
              <TH numeric>{t('columns.stock')}</TH>
              <TH numeric>
                <span className="sr-only">{tCommon('errors.unknown')}</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((s) => (
              <SkuRow key={s.id} row={s} locale={locale} deleteAction={deleteAction} />
            ))}
          </TBody>
        </Table>
      )}

      <div className="rounded-lg border border-dashed border-border bg-bg-subtle p-4">
        <p className="mb-3 text-sm font-semibold">{t('add_title')}</p>
        <form action={createAction} className="space-y-4">
          <input type="hidden" name="campaign_id" value={campaignId} />
          {errorMessage ? <Alert variant="danger">{errorMessage}</Alert> : null}

          <I18nField
            id="sku_name"
            labels={{ en: tI18nField('name_en'), ar: tI18nField('name_ar') }}
            value={name}
            onChange={setName}
            required
          />
          <input type="hidden" name="name_i18n_en" value={name.en ?? ''} />
          <input type="hidden" name="name_i18n_ar" value={name.ar ?? ''} />

          <I18nField
            id="sku_unit"
            labels={{ en: t('unit_en_label'), ar: t('unit_ar_label') }}
            value={unit}
            onChange={setUnit}
            required
          />
          <input type="hidden" name="unit_i18n_en" value={unit.en ?? ''} />
          <input type="hidden" name="unit_i18n_ar" value={unit.ar ?? ''} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="target" required>
                {t('target_label')}
              </Label>
              <Input
                id="target"
                name="target"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                dir="ltr"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="stock_allocated" required>
                {t('stock_label')}
              </Label>
              <Input
                id="stock_allocated"
                name="stock_allocated"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                dir="ltr"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex items-center justify-end">
            <Button type="submit" disabled={createPending}>
              {createPending ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
              ) : (
                <Plus className="h-4 w-4" strokeWidth={1.75} />
              )}
              {createPending ? tCommon('create_loading') : t('add_cta')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SkuRow({
  row,
  locale,
  deleteAction,
}: {
  row: CampaignSkuRow;
  locale: string;
  deleteAction: (formData: FormData) => void;
}) {
  const t = useTranslations('Admin.campaigns.skus_panel');
  const [updateState, updateActionFn, updatePending] = useActionState(
    updateSkuAction,
    initialState,
  );
  const [target, setTarget] = useState(String(row.target));
  const [stock, setStock] = useState(String(row.stock_allocated));

  return (
    <TR>
      <TD>{pickI18n(row.name_i18n, locale)}</TD>
      <TD>
        <span className="text-fg-secondary">{pickI18n(row.unit_i18n, locale)}</span>
      </TD>
      <TD numeric>
        <form action={updateActionFn} className="inline-flex items-center gap-2">
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="campaign_id" value={row.campaign_id} />
          <input type="hidden" name="name_i18n_en" value={row.name_i18n.en ?? ''} />
          <input type="hidden" name="name_i18n_ar" value={row.name_i18n.ar ?? ''} />
          <input type="hidden" name="unit_i18n_en" value={row.unit_i18n.en ?? ''} />
          <input type="hidden" name="unit_i18n_ar" value={row.unit_i18n.ar ?? ''} />
          <input type="hidden" name="stock_allocated" value={stock} />
          <Input
            name="target"
            type="number"
            min={0}
            dir="ltr"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="h-7 w-20"
            aria-label={t('target_label')}
          />
          <Button type="submit" size="sm" variant="ghost" disabled={updatePending}>
            {updatePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('save_short')}
          </Button>
          {updateState.error ? <span className="text-xs text-danger">!</span> : null}
        </form>
      </TD>
      <TD numeric>
        <Input
          type="number"
          min={0}
          dir="ltr"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          className="h-7 w-24"
          aria-label={t('stock_label')}
        />
      </TD>
      <TD numeric>
        <form action={deleteAction} className="inline-flex">
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="campaign_id" value={row.campaign_id} />
          <button
            type="submit"
            aria-label={t('delete')}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-danger hover:bg-danger-subtle"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          </button>
        </form>
      </TD>
    </TR>
  );
}
