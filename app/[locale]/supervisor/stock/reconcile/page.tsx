import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { StatusPill } from '@/components/ui/status-pill';
import { EmptyState } from '@/components/ui/empty-state';
import { ReconcileButton } from '@/components/features/supervisor/reconcile-button';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabase } from '@/lib/supabase/server';
import { listCampaigns } from '@/lib/queries/campaigns';
import { i18n } from '@/lib/validations/i18n';
import { ClipboardList } from 'lucide-react';

type ReconRow = {
  id: string;
  campaign_id: string;
  scope: 'supervisor' | 'location' | 'campaign';
  entity_id: string | null;
  status: 'matched' | 'mismatched' | 'resolved';
  reconciled_at: string;
  details: unknown;
};

async function listMyReconciliations(campaignId: string, supervisorId: string): Promise<ReconRow[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('stock_reconciliations')
    .select('id, campaign_id, scope, entity_id, status, reconciled_at, details')
    .eq('campaign_id', campaignId)
    .eq('scope', 'supervisor')
    .eq('entity_id', supervisorId)
    .order('reconciled_at', { ascending: false })
    .limit(50);
  return (data as ReconRow[] | null) ?? [];
}

export default async function SupervisorReconcilePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ campaign?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const [actor, campaigns, t] = await Promise.all([
    requireRole('supervisor', 'admin'),
    listCampaigns(null),
    getTranslations('Supervisor.stock.reconcile'),
  ]);
  const activeCampaigns = campaigns.filter(
    (c) => c.status === 'active' || c.status === 'planned',
  );
  const selectedCampaignId = sp.campaign ?? activeCampaigns[0]?.id ?? null;
  const history = selectedCampaignId
    ? await listMyReconciliations(selectedCampaignId, actor.id)
    : [];

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-end justify-between border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="mt-1 text-sm text-fg-secondary">{t('description')}</p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/supervisor/stock">{t('back_to_overview')}</Link>
        </Button>
      </div>

      <form method="get" className="mt-6 flex items-center gap-3">
        <label className="text-sm text-fg-secondary">{t('filter_campaign')}</label>
        <Select name="campaign" defaultValue={selectedCampaignId ?? ''} className="max-w-xs">
          {activeCampaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {i18n(c.name_i18n, locale)}
            </option>
          ))}
        </Select>
        <Button type="submit" size="sm" variant="secondary">
          {t('apply')}
        </Button>
      </form>

      {selectedCampaignId ? (
        <div className="mt-6 rounded-md border border-border bg-bg-subtle p-4">
          <ReconcileButton campaignId={selectedCampaignId} supervisorId={actor.id} />
        </div>
      ) : null}

      <div className="mt-8">
        <h2 className="text-sm font-semibold">{t('history_title')}</h2>
        {history.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={t('history_empty_title')}
            description={t('history_empty_description')}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('columns.when')}</TH>
                <TH>{t('columns.status')}</TH>
                <TH numeric>{t('columns.flags')}</TH>
              </tr>
            </THead>
            <TBody>
              {history.map((r) => {
                const det = Array.isArray(r.details) ? r.details.length : 0;
                const variant =
                  r.status === 'matched'
                    ? 'success'
                    : r.status === 'mismatched'
                      ? 'warning'
                      : 'info';
                return (
                  <TR key={r.id}>
                    <TD>
                      <span dir="ltr" className="font-mono text-xs tabular-nums text-fg-secondary">
                        {new Date(r.reconciled_at).toISOString().replace('T', ' ').slice(0, 16)}
                      </span>
                    </TD>
                    <TD>
                      <StatusPill variant={variant} label={t(`status_${r.status}`)} />
                    </TD>
                    <TD numeric>
                      <span className="font-mono text-xs tabular-nums">{det}</span>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}
