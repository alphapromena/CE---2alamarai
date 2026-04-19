import { Boxes, RotateCcw } from 'lucide-react';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill } from '@/components/ui/status-pill';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabase } from '@/lib/supabase/server';
import { i18n } from '@/lib/validations/i18n';

type MyBalanceRow = {
  campaign_id: string;
  sku_id: string;
  entity_type: 'promoter';
  entity_id: string;
  total_in: number;
  total_out: number;
  balance: number;
};

type MyRecentMove = {
  id: string;
  campaign_id: string;
  sku_id: string;
  from_entity_type: string;
  from_entity_id: string | null;
  to_entity_type: string;
  to_entity_id: string | null;
  quantity: number;
  movement_kind: string;
  created_at: string;
};

async function listMyBalances(promoterId: string): Promise<MyBalanceRow[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('stock_balances')
    .select('*')
    .eq('entity_type', 'promoter')
    .eq('entity_id', promoterId);
  return (data as MyBalanceRow[] | null) ?? [];
}

async function listMyRecentMovements(promoterId: string): Promise<MyRecentMove[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('stock_movements')
    .select(
      'id, campaign_id, sku_id, from_entity_type, from_entity_id, to_entity_type, to_entity_id, quantity, movement_kind, created_at',
    )
    .or(`from_entity_id.eq.${promoterId},to_entity_id.eq.${promoterId}`)
    .order('created_at', { ascending: false })
    .limit(25);
  return (data as MyRecentMove[] | null) ?? [];
}

async function listCampaignsById(ids: readonly string[]): Promise<
  Record<string, { ar?: string; en?: string }>
> {
  if (ids.length === 0) return {};
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('campaigns')
    .select('id, name_i18n')
    .in('id', ids as string[]);
  const out: Record<string, { ar?: string; en?: string }> = {};
  for (const r of (data as { id: string; name_i18n: { ar?: string; en?: string } | null }[] | null) ?? []) {
    if (r.name_i18n) out[r.id] = r.name_i18n;
  }
  return out;
}

const KIND_VARIANT: Record<string, 'neutral' | 'success' | 'info' | 'warning' | 'danger'> = {
  allocation: 'success',
  distribution: 'info',
  reallocation: 'warning',
  usage: 'neutral',
  return: 'neutral',
  correction: 'danger',
};

export default async function PromoterStockPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const actor = await requireRole('promoter');
  const [balances, movements, t, tKind] = await Promise.all([
    listMyBalances(actor.id),
    listMyRecentMovements(actor.id),
    getTranslations('Promoter.stock'),
    getTranslations('Admin.stock.kinds'),
  ]);

  const campaignIds = Array.from(
    new Set([...balances.map((b) => b.campaign_id), ...movements.map((m) => m.campaign_id)]),
  );
  const campaignNames = await listCampaignsById(campaignIds);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex items-end justify-between border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="mt-1 text-sm text-fg-secondary">{t('description')}</p>
        </div>
        <Button asChild>
          <Link href="/promoter/stock/return">
            <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {t('return_cta')}
          </Link>
        </Button>
      </div>

      <section className="mt-6">
        <h2 className="text-sm font-semibold">{t('balances_title')}</h2>
        {balances.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title={t('empty_title')}
            description={t('empty_description')}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('columns.campaign')}</TH>
                <TH>{t('columns.sku')}</TH>
                <TH numeric>{t('columns.received')}</TH>
                <TH numeric>{t('columns.used')}</TH>
                <TH numeric>{t('columns.on_hand')}</TH>
              </tr>
            </THead>
            <TBody>
              {balances.map((b) => (
                <TR key={`${b.campaign_id}|${b.sku_id}`}>
                  <TD>
                    <span className="text-xs">
                      {i18n(campaignNames[b.campaign_id] ?? null, locale) ||
                        b.campaign_id.slice(0, 8)}
                    </span>
                  </TD>
                  <TD>
                    <span className="font-mono text-xs text-fg-muted">{b.sku_id.slice(0, 8)}</span>
                  </TD>
                  <TD numeric>
                    <span className="font-mono text-xs tabular-nums">{b.total_in}</span>
                  </TD>
                  <TD numeric>
                    <span className="font-mono text-xs tabular-nums">{b.total_out}</span>
                  </TD>
                  <TD numeric>
                    <span
                      className={`font-mono text-xs font-semibold tabular-nums ${
                        b.balance < 0 ? 'text-danger' : b.balance === 0 ? 'text-fg-muted' : ''
                      }`}
                    >
                      {b.balance}
                    </span>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold">{t('recent_title')}</h2>
        {movements.length === 0 ? (
          <p className="mt-3 text-sm text-fg-muted">{t('recent_empty')}</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('columns.when')}</TH>
                <TH>{t('columns.kind')}</TH>
                <TH>{t('columns.direction')}</TH>
                <TH numeric>{t('columns.qty')}</TH>
              </tr>
            </THead>
            <TBody>
              {movements.map((m) => {
                const incoming = m.to_entity_id === actor.id;
                return (
                  <TR key={m.id}>
                    <TD>
                      <span
                        dir="ltr"
                        className="font-mono text-xs tabular-nums text-fg-secondary"
                      >
                        {new Date(m.created_at).toISOString().replace('T', ' ').slice(0, 16)}
                      </span>
                    </TD>
                    <TD>
                      <StatusPill
                        variant={KIND_VARIANT[m.movement_kind] ?? 'neutral'}
                        label={tKind(m.movement_kind)}
                      />
                    </TD>
                    <TD>
                      <span className="text-xs">
                        {incoming ? t('direction_incoming') : t('direction_outgoing')}
                      </span>
                    </TD>
                    <TD numeric>
                      <span
                        className={`font-mono text-xs tabular-nums ${
                          incoming ? 'text-success' : 'text-fg-secondary'
                        }`}
                      >
                        {incoming ? '+' : '−'}
                        {m.quantity}
                      </span>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </section>
    </div>
  );
}
