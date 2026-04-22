'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { AutoDismissAlert } from '@/components/ui/auto-dismiss-alert';
import { Button } from '@/components/ui/button';
import {
  setCampaignLocationsAction,
  type ChildActionState,
} from '@/app/[locale]/admin/campaigns/actions';
import { i18n } from '@/lib/validations/i18n';

export interface CampaignLocationsManagerProps {
  campaignId: string;
  selected: string[];
  available: { id: string; name_i18n: { ar?: string; en?: string } }[];
  locale: string;
}

const initialState: ChildActionState = { error: null };

export function CampaignLocationsManager({
  campaignId,
  selected,
  available,
  locale,
}: CampaignLocationsManagerProps) {
  const t = useTranslations('Admin.campaigns.locations_panel');
  const tCommon = useTranslations('Admin.common');

  const [state, formAction, isPending] = useActionState(setCampaignLocationsAction, initialState);
  const [picked, setPicked] = useState<Set<string>>(new Set(selected));

  const errorMessage = state.error ? tCommon('errors.unknown') : null;

  function toggle(id: string) {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="campaign_id" value={campaignId} />
      {Array.from(picked).map((id) => (
        <input key={id} type="hidden" name="location_ids" value={id} />
      ))}

      {errorMessage ? <Alert variant="danger">{errorMessage}</Alert> : null}
      {state.error === null && !isPending ? (
        <AutoDismissAlert variant="success">{tCommon('saved')}</AutoDismissAlert>
      ) : null}

      {available.length === 0 ? (
        <p className="text-sm text-fg-muted">{t('no_locations')}</p>
      ) : (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {available.map((loc) => (
            <label
              key={loc.id}
              className="flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm hover:bg-bg-hover"
            >
              <input
                type="checkbox"
                checked={picked.has(loc.id)}
                onChange={() => toggle(loc.id)}
                className="focus:ring-accent/20 h-4 w-4 rounded border-border text-accent focus:ring-2"
              />
              <span>{i18n(loc.name_i18n, locale)}</span>
            </label>
          ))}
        </div>
      )}

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={isPending || available.length === 0}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} /> : null}
          {isPending ? tCommon('save_loading') : tCommon('save_cta')}
        </Button>
      </div>
    </form>
  );
}
