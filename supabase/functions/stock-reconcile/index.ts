// stock-reconcile — computes ledger balances from stock_movements and emits
// low_stock / no_usage / reconciliation_mismatch alerts. Writes a
// stock_reconciliations snapshot when run in TARGETED mode.
//
// Modes:
//
//   1. TARGETED.  POST { campaign_id, scope, entity_id, declarations? }.
//      Auth: verify_jwt = true (caller must have SELECT on the
//      stock_movements in scope). The function runs with service role for
//      writes, but re-checks RLS on read first — exactly like compute-kpis
//      does for daily_reports.
//      - scope='campaign' → entity_id null, whole-campaign reconciliation
//        (admin-initiated).
//      - scope='supervisor' → entity_id = profiles.id; their + their
//        visible-promoters' balances are summed.
//      - scope='location' → entity_id = locations.id; the location's own
//        balance is used.
//      - declarations is an optional array [{ sku_id, declared_on_hand }];
//        when present, detectReconciliationMismatch runs and the resulting
//        flags are persisted as alerts + noted in the reconciliation row's
//        details.
//      Always writes exactly one row into stock_reconciliations.
//
//   2. SWEEP.  POST { sweep: true } + x-cron-secret header.
//      Auth: CRON_SECRET only.  Pulls every active campaign, reduces its
//      ledger, runs detectLowStock + detectNoUsage, and upserts alerts for
//      each flag that is not already open.  No stock_reconciliations row is
//      written — the sweep is a detector, not a snapshot.
//
// The math lives in ../_shared/ledger.ts — a byte-for-byte mirror of
// lib/stock/ledger.ts whose tests (lib/stock/ledger.test.ts) are the
// source of truth.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.3';
import {
  computeBalances,
  detectLowStock,
  detectNoUsage,
  detectReconciliationMismatch,
  readLowStockThreshold,
  readNoUsageHours,
  type Movement,
  type NoUsageInput,
  type ReconciliationDeclaration,
  type AnomalyFlag,
} from '../_shared/ledger.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type MovementRow = {
  id: string;
  campaign_id: string;
  sku_id: string;
  from_entity_type: Movement['from_entity_type'];
  from_entity_id: string | null;
  to_entity_type: Movement['to_entity_type'];
  to_entity_id: string | null;
  quantity: number;
  movement_kind: Movement['movement_kind'];
  created_at: string;
};

async function fetchCampaignMovements(
  admin: ReturnType<typeof createClient>,
  campaignId: string,
): Promise<Movement[]> {
  const out: Movement[] = [];
  const pageSize = 1000;
  let offset = 0;
  // Pull in pages. Caps at 20k rows per campaign sweep — past that the sweep
  // should run more frequently or per-supervisor.
  for (let i = 0; i < 20; i += 1) {
    const { data, error } = await admin
      .from('stock_movements')
      .select(
        'id, campaign_id, sku_id, from_entity_type, from_entity_id, to_entity_type, to_entity_id, quantity, movement_kind, created_at',
      )
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`movements fetch failed: ${error.message}`);
    const rows = (data as unknown as MovementRow[]) ?? [];
    for (const r of rows) {
      out.push({
        id: r.id,
        campaign_id: r.campaign_id,
        sku_id: r.sku_id,
        from_entity_type: r.from_entity_type,
        from_entity_id: r.from_entity_id,
        to_entity_type: r.to_entity_type,
        to_entity_id: r.to_entity_id,
        quantity: r.quantity,
        movement_kind: r.movement_kind,
        created_at: r.created_at,
      });
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

/**
 * Builds the NoUsage input set for every promoter that has received stock
 * for a given (campaign, sku). last_usage_at is the most recent usage row's
 * created_at for that promoter-SKU pair; null when no usage has been logged.
 */
function buildNoUsageInputs(movements: Movement[]): NoUsageInput[] {
  const received = new Map<string, { campaign_id: string; sku_id: string; promoter_id: string; received: number }>();
  const lastUsage = new Map<string, string>();
  for (const m of movements) {
    if (m.to_entity_type === 'promoter' && m.to_entity_id) {
      const key = `${m.campaign_id}|${m.sku_id}|${m.to_entity_id}`;
      const prior = received.get(key);
      if (prior) prior.received += m.quantity;
      else
        received.set(key, {
          campaign_id: m.campaign_id,
          sku_id: m.sku_id,
          promoter_id: m.to_entity_id,
          received: m.quantity,
        });
    }
    if (
      m.movement_kind === 'usage' &&
      m.from_entity_type === 'promoter' &&
      m.from_entity_id
    ) {
      const key = `${m.campaign_id}|${m.sku_id}|${m.from_entity_id}`;
      const existing = lastUsage.get(key);
      const incoming = m.created_at ?? '';
      if (!existing || incoming > existing) lastUsage.set(key, incoming);
    }
    // Returns (promoter → supervisor) subtract from received — a returned cup
    // is not "received" for the purpose of no_usage detection.
    if (
      m.movement_kind === 'return' &&
      m.from_entity_type === 'promoter' &&
      m.from_entity_id
    ) {
      const key = `${m.campaign_id}|${m.sku_id}|${m.from_entity_id}`;
      const prior = received.get(key);
      if (prior) prior.received -= m.quantity;
    }
  }
  const out: NoUsageInput[] = [];
  for (const [key, v] of received) {
    out.push({
      campaign_id: v.campaign_id,
      sku_id: v.sku_id,
      promoter_id: v.promoter_id,
      received: v.received,
      last_usage_at: lastUsage.get(key) ?? null,
    });
  }
  return out;
}

type ExistingAlertKey = string;

/**
 * Compute a stable dedup key for a flag. The sweep re-runs frequently; we
 * never want to open a second alert for the same underlying condition.
 * When the condition clears, the existing alert's status (acknowledged /
 * resolved / dismissed) is respected — we only re-insert when no OPEN
 * alert of the same key exists.
 */
function flagKey(flag: AnomalyFlag): ExistingAlertKey {
  switch (flag.kind) {
    case 'low_stock':
      return `low_stock|${flag.campaign_id}|${flag.sku_id}|${flag.entity_type}|${flag.entity_id ?? ''}`;
    case 'no_usage':
      return `no_usage|${flag.campaign_id}|${flag.sku_id}|${flag.promoter_id}`;
    case 'reconciliation_mismatch':
      return `reconciliation_mismatch|${flag.campaign_id}|${flag.sku_id}|${flag.supervisor_id}`;
    case 'over_consumption':
      return `over_consumption|${flag.campaign_id}|${flag.sku_id}|${flag.promoter_id}`;
  }
}

async function upsertAlertsForFlags(
  admin: ReturnType<typeof createClient>,
  campaignId: string,
  flags: AnomalyFlag[],
): Promise<{ inserted: number; skipped: number }> {
  if (flags.length === 0) return { inserted: 0, skipped: 0 };

  // Fetch all currently-open alerts for this campaign so we can skip dupes.
  const { data: openRows, error: openErr } = await admin
    .from('alerts')
    .select('id, alert_type, campaign_id, location_id, user_id, message_params')
    .eq('campaign_id', campaignId)
    .eq('status', 'open')
    .in('alert_type', [
      'low_stock',
      'no_usage',
      'reconciliation_mismatch',
      'over_consumption',
    ]);
  if (openErr) throw new Error(`open alerts fetch failed: ${openErr.message}`);

  const existing = new Set<ExistingAlertKey>();
  type OpenRow = {
    alert_type: AnomalyFlag['kind'];
    campaign_id: string;
    location_id: string | null;
    user_id: string | null;
    message_params: Record<string, unknown>;
  };
  for (const row of (openRows as unknown as OpenRow[]) ?? []) {
    const params = row.message_params ?? {};
    const skuId = typeof params.sku_id === 'string' ? params.sku_id : '';
    const entityType = typeof params.entity_type === 'string' ? params.entity_type : '';
    const entityId =
      typeof params.entity_id === 'string' ? params.entity_id :
      typeof params.entity_id === 'number' ? String(params.entity_id) :
      '';
    const supervisorId =
      typeof params.supervisor_id === 'string' ? params.supervisor_id : '';
    switch (row.alert_type) {
      case 'low_stock':
        existing.add(`low_stock|${row.campaign_id}|${skuId}|${entityType}|${entityId}`);
        break;
      case 'no_usage':
        existing.add(`no_usage|${row.campaign_id}|${skuId}|${row.user_id ?? ''}`);
        break;
      case 'reconciliation_mismatch':
        existing.add(`reconciliation_mismatch|${row.campaign_id}|${skuId}|${supervisorId}`);
        break;
      case 'over_consumption':
        existing.add(`over_consumption|${row.campaign_id}|${skuId}|${row.user_id ?? ''}`);
        break;
    }
  }

  type AlertInsert = {
    alert_type: AnomalyFlag['kind'];
    severity: 'info' | 'warning' | 'critical';
    status: 'open';
    user_id: string | null;
    campaign_id: string;
    location_id: string | null;
    message_key: string;
    message_params: Record<string, unknown>;
  };

  const inserts: AlertInsert[] = [];
  let skipped = 0;
  for (const flag of flags) {
    const key = flagKey(flag);
    if (existing.has(key)) {
      skipped += 1;
      continue;
    }
    existing.add(key); // de-dupe within the same sweep run too

    switch (flag.kind) {
      case 'low_stock':
        inserts.push({
          alert_type: 'low_stock',
          severity: 'warning',
          status: 'open',
          user_id: flag.entity_type === 'supervisor' || flag.entity_type === 'promoter' ? flag.entity_id : null,
          campaign_id: flag.campaign_id,
          location_id: flag.entity_type === 'location' ? flag.entity_id : null,
          message_key: 'alerts.low_stock',
          message_params: {
            sku_id: flag.sku_id,
            entity_type: flag.entity_type,
            entity_id: flag.entity_id,
            balance: flag.balance,
            threshold: flag.threshold,
          },
        });
        break;
      case 'no_usage':
        inserts.push({
          alert_type: 'no_usage',
          severity: 'warning',
          status: 'open',
          user_id: flag.promoter_id,
          campaign_id: flag.campaign_id,
          location_id: null,
          message_key: 'alerts.no_usage',
          message_params: {
            sku_id: flag.sku_id,
            received: flag.received,
            hours_since: flag.hours_since,
          },
        });
        break;
      case 'reconciliation_mismatch':
        inserts.push({
          alert_type: 'reconciliation_mismatch',
          severity: 'critical',
          status: 'open',
          user_id: flag.supervisor_id,
          campaign_id: flag.campaign_id,
          location_id: null,
          message_key: 'alerts.reconciliation_mismatch',
          message_params: {
            sku_id: flag.sku_id,
            supervisor_id: flag.supervisor_id,
            expected: flag.expected,
            declared: flag.declared,
            diff: flag.diff,
          },
        });
        break;
      case 'over_consumption':
        // The insert-time invariant trigger + the Server Action helper
        // already raise this on the live write path. The sweep only
        // surfaces cases missed due to eventual-consistency reporting — rare.
        inserts.push({
          alert_type: 'over_consumption',
          severity: 'critical',
          status: 'open',
          user_id: flag.promoter_id,
          campaign_id: flag.campaign_id,
          location_id: null,
          message_key: 'alerts.over_consumption',
          message_params: {
            sku_id: flag.sku_id,
            attempted: flag.attempted,
            available: flag.available,
          },
        });
        break;
    }
  }

  if (inserts.length === 0) return { inserted: 0, skipped };
  const { error: insErr } = await admin.from('alerts').insert(inserts);
  if (insErr) throw new Error(`alerts insert failed: ${insErr.message}`);
  return { inserted: inserts.length, skipped };
}

// ---------------------------------------------------------------------------
// SWEEP mode
// ---------------------------------------------------------------------------

async function runSweep(
  admin: ReturnType<typeof createClient>,
): Promise<{ considered: number; inserted: number; skipped: number; errors: number }> {
  const { data: camps, error: campErr } = await admin
    .from('campaigns')
    .select('id, status, kpi_config')
    .eq('status', 'active');
  if (campErr) throw new Error(`campaigns fetch failed: ${campErr.message}`);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  const considered = (camps as unknown as { id: string }[] ?? []).length;

  for (const camp of (camps as unknown as { id: string; kpi_config: unknown }[]) ?? []) {
    try {
      const movements = await fetchCampaignMovements(admin, camp.id);
      if (movements.length === 0) continue;
      const balances = computeBalances(movements);
      const lowStockThreshold = readLowStockThreshold(camp.kpi_config);
      const noUsageHours = readNoUsageHours(camp.kpi_config);

      const flags: AnomalyFlag[] = [];
      flags.push(
        ...detectLowStock(balances, { low_stock_threshold: lowStockThreshold }),
      );
      flags.push(
        ...detectNoUsage(
          buildNoUsageInputs(movements),
          { no_usage_hours: noUsageHours },
          new Date(),
        ),
      );

      const res = await upsertAlertsForFlags(admin, camp.id, flags);
      inserted += res.inserted;
      skipped += res.skipped;
    } catch (e) {
      errors += 1;
      console.error('sweep campaign failed', { campaign_id: camp.id, error: (e as Error).message });
    }
  }

  return { considered, inserted, skipped, errors };
}

// ---------------------------------------------------------------------------
// TARGETED mode
// ---------------------------------------------------------------------------

type TargetedInput = {
  campaign_id: string;
  scope: 'campaign' | 'supervisor' | 'location';
  entity_id: string | null;
  declarations?: Array<{ sku_id: string; declared_on_hand: number; promoter_ids?: string[] }>;
  note?: string | null;
};

function parseTargeted(body: Record<string, unknown>): TargetedInput | null {
  const campaign_id = body.campaign_id;
  const scope = body.scope;
  const entity_id = body.entity_id ?? null;
  if (typeof campaign_id !== 'string' || !UUID_RE.test(campaign_id)) return null;
  if (scope !== 'campaign' && scope !== 'supervisor' && scope !== 'location') return null;
  if (scope === 'campaign') {
    if (entity_id !== null) return null;
  } else {
    if (typeof entity_id !== 'string' || !UUID_RE.test(entity_id)) return null;
  }
  const declarationsRaw = body.declarations;
  let declarations: TargetedInput['declarations'];
  if (declarationsRaw !== undefined) {
    if (!Array.isArray(declarationsRaw)) return null;
    declarations = [];
    for (const d of declarationsRaw) {
      if (!d || typeof d !== 'object') return null;
      const rec = d as Record<string, unknown>;
      if (typeof rec.sku_id !== 'string' || !UUID_RE.test(rec.sku_id)) return null;
      if (typeof rec.declared_on_hand !== 'number' || !Number.isFinite(rec.declared_on_hand)) return null;
      const promoterIds: string[] = [];
      if (rec.promoter_ids !== undefined) {
        if (!Array.isArray(rec.promoter_ids)) return null;
        for (const p of rec.promoter_ids) {
          if (typeof p !== 'string' || !UUID_RE.test(p)) return null;
          promoterIds.push(p);
        }
      }
      declarations.push({
        sku_id: rec.sku_id,
        declared_on_hand: rec.declared_on_hand,
        promoter_ids: promoterIds,
      });
    }
  }
  const note = typeof body.note === 'string' ? body.note : null;
  return { campaign_id, scope, entity_id, declarations, note };
}

async function runTargeted(
  admin: ReturnType<typeof createClient>,
  input: TargetedInput,
  reconciledBy: string,
): Promise<{ reconciliation_id: string; status: 'matched' | 'mismatched'; flags: AnomalyFlag[] }>
{
  const movements = await fetchCampaignMovements(admin, input.campaign_id);
  const balances = computeBalances(movements);

  // Reconciliation-mismatch detection: only runs when declarations are given.
  let mismatchFlags: AnomalyFlag[] = [];
  if (input.declarations && input.scope === 'supervisor' && input.entity_id) {
    const supervisorId = input.entity_id;
    const decls: (ReconciliationDeclaration & { promoter_ids: readonly string[] })[] =
      input.declarations.map((d) => ({
        supervisor_id: supervisorId,
        campaign_id: input.campaign_id,
        sku_id: d.sku_id,
        declared_on_hand: d.declared_on_hand,
        promoter_ids: d.promoter_ids ?? [],
      }));
    mismatchFlags = detectReconciliationMismatch(decls, balances);
  }

  // Low-stock and no-usage flags filtered to the scope.
  const { data: camp } = await admin
    .from('campaigns')
    .select('kpi_config')
    .eq('id', input.campaign_id)
    .maybeSingle();
  const kpiConfig = (camp as { kpi_config: unknown } | null)?.kpi_config ?? null;
  const lowStockThreshold = readLowStockThreshold(kpiConfig);
  const noUsageHours = readNoUsageHours(kpiConfig);

  const allFlags: AnomalyFlag[] = [
    ...detectLowStock(balances, { low_stock_threshold: lowStockThreshold }),
    ...detectNoUsage(
      buildNoUsageInputs(movements),
      { no_usage_hours: noUsageHours },
      new Date(),
    ),
    ...mismatchFlags,
  ];

  // Filter to scope.
  const scopedFlags = allFlags.filter((f) => {
    if (input.scope === 'campaign') return true;
    if (input.scope === 'supervisor') {
      if (f.kind === 'low_stock') return f.entity_type === 'supervisor' && f.entity_id === input.entity_id;
      if (f.kind === 'reconciliation_mismatch') return f.supervisor_id === input.entity_id;
      if (f.kind === 'no_usage') return false; // no_usage is per-promoter; supervisor scope filters those out
      return false;
    }
    if (input.scope === 'location') {
      if (f.kind === 'low_stock') return f.entity_type === 'location' && f.entity_id === input.entity_id;
      return false;
    }
    return false;
  });

  const status: 'matched' | 'mismatched' = scopedFlags.length === 0 ? 'matched' : 'mismatched';

  // Persist alerts for the scoped flags.
  await upsertAlertsForFlags(admin, input.campaign_id, scopedFlags);

  // Persist reconciliation snapshot.
  const details: Record<string, unknown>[] = [];
  for (const flag of scopedFlags) {
    details.push({ ...flag });
  }
  if (input.declarations) {
    for (const d of input.declarations) {
      details.push({ kind: 'declaration', sku_id: d.sku_id, declared_on_hand: d.declared_on_hand });
    }
  }
  const { data: reconRow, error: reconErr } = await admin
    .from('stock_reconciliations')
    .insert({
      campaign_id: input.campaign_id,
      scope: input.scope,
      entity_id: input.scope === 'campaign' ? null : input.entity_id,
      reconciled_by: reconciledBy,
      status,
      details,
      note: input.note ?? null,
    })
    .select('id')
    .single();
  if (reconErr || !reconRow) {
    throw new Error(`reconciliation insert failed: ${reconErr?.message ?? 'unknown'}`);
  }
  return { reconciliation_id: (reconRow as { id: string }).id, status, flags: scopedFlags };
}

// ---------------------------------------------------------------------------
// HTTP entry
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, { status: 405 });
  }

  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // SWEEP ---------------------------------------------------------------
  if (body.sweep === true) {
    const provided = req.headers.get('x-cron-secret') ?? '';
    if (!CRON_SECRET || provided !== CRON_SECRET) {
      return json({ error: 'forbidden' }, { status: 403 });
    }
    try {
      const result = await runSweep(admin);
      return json({
        ok: true,
        mode: 'sweep',
        ran_at: new Date().toISOString(),
        ...result,
      });
    } catch (e) {
      return json({ error: 'sweep_failed', detail: (e as Error).message }, { status: 500 });
    }
  }

  // TARGETED ------------------------------------------------------------
  const parsed = parseTargeted(body);
  if (!parsed) return json({ error: 'invalid_input' }, { status: 400 });

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json({ error: 'unauthenticated' }, { status: 401 });
  }
  const callerToken = authHeader.slice(7).trim();

  // Resolve caller id + role via the user-scoped client. Admins may target
  // any scope; supervisors may only target themselves or their locations.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData?.user) {
    return json({ error: 'unauthenticated' }, { status: 401 });
  }
  const callerId = authData.user.id;

  const { data: profile, error: profErr } = await userClient
    .from('profiles')
    .select('id, role, assigned_locations')
    .eq('id', callerId)
    .maybeSingle();
  if (profErr || !profile) return json({ error: 'unauthenticated' }, { status: 401 });
  type Profile = { id: string; role: string; assigned_locations: string[] | null };
  const p = profile as unknown as Profile;

  if (p.role !== 'admin' && p.role !== 'supervisor') {
    return json({ error: 'forbidden' }, { status: 403 });
  }
  if (p.role === 'supervisor') {
    if (parsed.scope === 'campaign') {
      return json({ error: 'forbidden' }, { status: 403 });
    }
    if (parsed.scope === 'supervisor' && parsed.entity_id !== callerId) {
      return json({ error: 'forbidden' }, { status: 403 });
    }
    if (parsed.scope === 'location') {
      const assigned = p.assigned_locations ?? [];
      if (!parsed.entity_id || !assigned.includes(parsed.entity_id)) {
        return json({ error: 'forbidden' }, { status: 403 });
      }
    }
  }

  try {
    const result = await runTargeted(admin, parsed, callerId);
    return json({ ok: true, mode: 'targeted', ...result });
  } catch (e) {
    return json({ error: 'targeted_failed', detail: (e as Error).message }, { status: 500 });
  }
});
