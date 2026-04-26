'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { requireRole } from '@/lib/auth/guards';
import {
  distributeStockSchema,
  reallocateStockSchema,
  returnToWarehouseSchema,
} from '@/lib/validations/stock';
import {
  insertStockMovement,
  reallocateStock,
  type InsertMovementError,
  type RpcMovementError,
} from '@/lib/stock/actions-helper';
import { z } from 'zod';
import {
  computeBalances,
  detectLowStock,
  detectNoUsage,
  readLowStockThreshold,
  readNoUsageHours,
  type Movement,
  type AnomalyFlag,
} from '@/lib/stock/ledger';
import { logAuditEvent } from '@/lib/auth/audit';
import { logError } from '@/lib/observability/logger';
import type { Json } from '@/lib/supabase/database.types';

export type StockActionState = {
  error: InsertMovementError | 'invalid_input' | 'location_not_assigned' | null;
  movementId?: string | null;
  replayed?: boolean;
};

export type ReallocateActionState = {
  error: RpcMovementError | 'invalid_input' | 'location_not_assigned' | null;
  movementId?: string | null;
  replayed?: boolean;
};

function canTouchLocation(
  role: 'admin' | 'supervisor',
  assigned: readonly string[],
  locationId: string,
): boolean {
  return role === 'admin' || assigned.includes(locationId);
}

/**
 * Supervisor distributes from their own inventory to a promoter at an
 * assigned location. RLS also enforces `from_entity_id = auth.uid()` on the
 * INSERT, but we re-check here for clearer error messaging + audit.
 */
export async function distributeStockAction(
  input: unknown,
): Promise<StockActionState> {
  const actor = await requireRole('supervisor', 'admin');
  const parsed = distributeStockSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_input' };

  if (
    !canTouchLocation(
      actor.role as 'admin' | 'supervisor',
      actor.assigned_locations,
      parsed.data.location_id,
    )
  ) {
    return { error: 'location_not_assigned' };
  }

  const result = await insertStockMovement(
    {
      campaign_id: parsed.data.campaign_id,
      sku_id: parsed.data.sku_id,
      from_entity_type: 'supervisor',
      from_entity_id: actor.id,
      to_entity_type: 'promoter',
      to_entity_id: parsed.data.promoter_id,
      quantity: parsed.data.quantity,
      movement_kind: 'distribution',
      user_id: actor.id,
      location_id: parsed.data.location_id,
      reason: parsed.data.reason,
      idempotency_key: parsed.data.idempotency_key,
    },
    'supervisor.stock_distributed',
  );

  if (result.error) return { error: result.error, movementId: null };

  const locale = await getLocale();
  revalidatePath(`/${locale}/supervisor/stock`);
  revalidatePath(`/${locale}/supervisor/stock/audit`);
  revalidatePath(`/${locale}/promoter/stock`);
  revalidatePath(`/${locale}/admin/stock/audit`);
  return { error: null, movementId: result.movementId, replayed: result.replayed };
}

/**
 * Supervisor returns unused stock from their own inventory to the warehouse.
 * Two-sided note: the opposite leg (promoter → supervisor) is handled by
 * `returnToSupervisorAction` in the promoter action file.
 */
export async function returnToWarehouseAction(
  input: unknown,
): Promise<StockActionState> {
  const actor = await requireRole('supervisor', 'admin');
  const parsed = returnToWarehouseSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_input' };

  if (
    parsed.data.location_id &&
    !canTouchLocation(
      actor.role as 'admin' | 'supervisor',
      actor.assigned_locations,
      parsed.data.location_id,
    )
  ) {
    return { error: 'location_not_assigned' };
  }

  const result = await insertStockMovement(
    {
      campaign_id: parsed.data.campaign_id,
      sku_id: parsed.data.sku_id,
      from_entity_type: 'supervisor',
      from_entity_id: actor.id,
      to_entity_type: 'warehouse',
      to_entity_id: null,
      quantity: parsed.data.quantity,
      movement_kind: 'return',
      user_id: actor.id,
      location_id: parsed.data.location_id ?? null,
      reason: parsed.data.reason,
      idempotency_key: parsed.data.idempotency_key,
    },
    'supervisor.stock_returned_to_warehouse',
  );

  if (result.error) return { error: result.error, movementId: null };

  const locale = await getLocale();
  revalidatePath(`/${locale}/supervisor/stock`);
  revalidatePath(`/${locale}/supervisor/stock/audit`);
  revalidatePath(`/${locale}/admin/stock`);
  revalidatePath(`/${locale}/admin/stock/audit`);
  return { error: null, movementId: result.movementId, replayed: result.replayed };
}

/**
 * Two-leg reallocation — supervisor↔supervisor or location↔location.
 * Atomic via the `reallocate_stock` RPC: authz + advisory lock + INSERT
 * all commit or nothing does. The RPC itself re-checks role + location
 * authorization server-side (SECURITY DEFINER path), so this action is a
 * thin forwarder that handles zod parsing, error translation, and revalidate.
 *
 * Cross-supervisor reallocation is admitted when the caller is an admin OR
 * when the caller is the from-side supervisor. D-025 (inter-supervisor
 * approval workflow) is not yet decided; when it lands, approval check goes
 * here, above the RPC call.
 */
export async function reallocateStockAction(
  input: unknown,
): Promise<ReallocateActionState> {
  const actor = await requireRole('supervisor', 'admin');
  const parsed = reallocateStockSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_input' };

  // Pre-flight authz for clearer error messaging. The RPC re-checks the
  // same rules; this is UX polish.
  if (actor.role === 'supervisor') {
    if (parsed.data.from_entity_type === 'supervisor') {
      if (parsed.data.from_entity_id !== actor.id) {
        return { error: 'not_authorized' };
      }
    } else if (parsed.data.from_entity_type === 'location') {
      if (!actor.assigned_locations.includes(parsed.data.from_entity_id)) {
        return { error: 'location_not_assigned' };
      }
      if (
        parsed.data.to_entity_type === 'location' &&
        !actor.assigned_locations.includes(parsed.data.to_entity_id)
      ) {
        return { error: 'location_not_assigned' };
      }
    }
  }

  const result = await reallocateStock(
    {
      campaign_id: parsed.data.campaign_id,
      sku_id: parsed.data.sku_id,
      from_entity_type: parsed.data.from_entity_type,
      from_entity_id: parsed.data.from_entity_id,
      to_entity_type: parsed.data.to_entity_type,
      to_entity_id: parsed.data.to_entity_id,
      quantity: parsed.data.quantity,
      user_id: actor.id,
      location_id: parsed.data.location_id ?? null,
      reason: parsed.data.reason ?? null,
      idempotency_key: parsed.data.idempotency_key,
    },
    'supervisor.stock_reallocated',
  );

  if (result.error) return { error: result.error, movementId: null };

  const locale = await getLocale();
  revalidatePath(`/${locale}/supervisor/stock`);
  revalidatePath(`/${locale}/supervisor/stock/audit`);
  revalidatePath(`/${locale}/admin/stock`);
  revalidatePath(`/${locale}/admin/stock/audit`);
  return { error: null, movementId: result.movementId, replayed: result.replayed };
}

// ============================================================================
// Reconciliation (in-process version of the stock-reconcile Edge Function,
// scoped to the caller's supervisor snapshot). Inserts one
// stock_reconciliations row capturing the current computed state.
//
// No declarations in this v1 — it's a "what does the ledger say right now?"
// snapshot. Declaration-based mismatch detection lives in the Edge Function
// and lands in Phase 7's declared-count flow.
// ============================================================================
const reconcileInputSchema = z
  .object({
    campaign_id: z.string().uuid(),
    supervisor_id: z.string().uuid(),
  })
  .strict();

export type ReconcileActionState = {
  error: 'invalid_input' | 'not_authorized' | 'reconcile_failed' | null;
  status?: 'matched' | 'mismatched';
  flags?: number;
};

export async function runReconcileAction(input: unknown): Promise<ReconcileActionState> {
  const actor = await requireRole('supervisor', 'admin');
  const parsed = reconcileInputSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_input' };
  if (actor.role === 'supervisor' && parsed.data.supervisor_id !== actor.id) {
    return { error: 'not_authorized' };
  }

  const admin = createAdminSupabase();

  const { data: campaignRow } = await admin
    .from('campaigns')
    .select('kpi_config')
    .eq('id', parsed.data.campaign_id)
    .maybeSingle();
  const kpiConfig = (campaignRow as { kpi_config: unknown } | null)?.kpi_config ?? null;

  const { data: movRows, error: movErr } = await admin
    .from('stock_movements')
    .select(
      'id, campaign_id, sku_id, from_entity_type, from_entity_id, to_entity_type, to_entity_id, quantity, movement_kind, created_at',
    )
    .eq('campaign_id', parsed.data.campaign_id);
  if (movErr) {
    logError('reconcileStockAction movement load failed', {
      actor_id: actor.id,
      campaign_id: parsed.data.campaign_id,
      supervisor_id: parsed.data.supervisor_id,
      code: movErr.code,
      message: movErr.message,
    });
    return { error: 'reconcile_failed' };
  }

  const movements: Movement[] = (movRows as unknown as Movement[] | null) ?? [];
  const balances = computeBalances(movements);

  const lowStockThreshold = readLowStockThreshold(kpiConfig);
  const noUsageHours = readNoUsageHours(kpiConfig);

  const { data: scopeRows } = await admin
    .from('user_assignments')
    .select('user_id')
    .in(
      'location_id',
      actor.assigned_locations.length > 0
        ? actor.assigned_locations
        : ['00000000-0000-0000-0000-000000000000'],
    )
    .eq('active', true);
  const visiblePromoters = new Set<string>(
    ((scopeRows as { user_id: string }[] | null) ?? []).map((r) => r.user_id),
  );

  const noUsageInputs: {
    campaign_id: string;
    sku_id: string;
    promoter_id: string;
    received: number;
    last_usage_at: string | null;
  }[] = [];
  const recv = new Map<string, { received: number; last: string | null }>();
  for (const m of movements) {
    if (m.to_entity_type === 'promoter' && m.to_entity_id && visiblePromoters.has(m.to_entity_id)) {
      const key = `${m.sku_id}|${m.to_entity_id}`;
      const prior = recv.get(key) ?? { received: 0, last: null };
      recv.set(key, { received: prior.received + m.quantity, last: prior.last });
    }
    if (m.movement_kind === 'usage' && m.from_entity_type === 'promoter' && m.from_entity_id) {
      const key = `${m.sku_id}|${m.from_entity_id}`;
      const prior = recv.get(key);
      if (prior) {
        const ts = m.created_at ?? '';
        if (!prior.last || ts > prior.last) prior.last = ts;
      }
    }
  }
  for (const [key, v] of recv) {
    const [skuId, promoterId] = key.split('|');
    noUsageInputs.push({
      campaign_id: parsed.data.campaign_id,
      sku_id: skuId!,
      promoter_id: promoterId!,
      received: v.received,
      last_usage_at: v.last,
    });
  }

  const allFlags: AnomalyFlag[] = [
    ...detectLowStock(balances, { low_stock_threshold: lowStockThreshold }),
    ...detectNoUsage(noUsageInputs, { no_usage_hours: noUsageHours }, new Date()),
  ];
  const scoped = allFlags.filter((f) => {
    if (f.kind === 'low_stock') {
      if (f.entity_type === 'supervisor') return f.entity_id === parsed.data.supervisor_id;
      if (f.entity_type === 'location') return actor.assigned_locations.includes(f.entity_id ?? '');
      if (f.entity_type === 'promoter') return visiblePromoters.has(f.entity_id ?? '');
    }
    if (f.kind === 'no_usage') return visiblePromoters.has(f.promoter_id);
    return false;
  });

  const status: 'matched' | 'mismatched' = scoped.length === 0 ? 'matched' : 'mismatched';

  const { data: reconRow, error: reconErr } = await admin
    .from('stock_reconciliations')
    .insert({
      campaign_id: parsed.data.campaign_id,
      scope: 'supervisor',
      entity_id: parsed.data.supervisor_id,
      reconciled_by: actor.id,
      status,
      details: scoped as unknown as Json,
    })
    .select('id')
    .single();
  if (reconErr || !reconRow) {
    if (reconErr) {
      logError('reconcileStockAction insert failed', {
        actor_id: actor.id,
        campaign_id: parsed.data.campaign_id,
        supervisor_id: parsed.data.supervisor_id,
        code: reconErr.code,
        message: reconErr.message,
      });
    }
    return { error: 'reconcile_failed' };
  }

  await logAuditEvent({
    actor_id: actor.id,
    action: 'supervisor.stock_reconciled',
    entity: 'stock_reconciliation',
    entity_id: (reconRow as { id: string }).id,
    after: { status, flags: scoped.length },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/supervisor/stock`);
  revalidatePath(`/${locale}/supervisor/stock/reconcile`);
  return { error: null, status, flags: scoped.length };
}
