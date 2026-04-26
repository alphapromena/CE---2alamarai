import 'server-only';

import { createAdminSupabase } from '@/lib/supabase/admin';
import { logAuditEvent } from '@/lib/auth/audit';
import { logError } from '@/lib/observability/logger';
import type { StockEntityType, StockMovementKind } from './ledger';

/**
 * Shared helper for inserting a stock_movement via a Server Action.
 *
 * Responsibilities:
 *   - Idempotency read-through on the UNIQUE `idempotency_key` index (D-009).
 *     A duplicate returns the original row with { replayed: true }.
 *   - Translates DB invariant-trigger errors (SQLSTATE 23514 with the
 *     'stock invariant violation' prefix) into actionable error codes.
 *   - Emits an `over_consumption` alert whenever the invariant trigger
 *     rejects a usage movement, so the supervisor dashboard surfaces the
 *     event even though no ledger row was written.
 *   - Writes an audit_log row on success.
 *
 * Callers are expected to have already:
 *   1. Verified role + zod-parsed the input.
 *   2. Checked any location/entity-ownership constraints.
 * This helper does NOT re-check authorisation — it trusts the caller.
 */

export type InsertMovementInput = {
  campaign_id: string;
  sku_id: string;
  from_entity_type: StockEntityType;
  from_entity_id: string | null;
  to_entity_type: StockEntityType;
  to_entity_id: string | null;
  quantity: number;
  movement_kind: StockMovementKind;
  /** profiles.id of the user executing the movement. */
  user_id: string;
  location_id: string | null;
  reason?: string | null;
  idempotency_key: string;
};

export type InsertMovementError =
  | 'over_consumption'
  | 'insufficient_balance'
  | 'insert_failed';

export type InsertMovementResult =
  | { error: null; movementId: string; replayed: boolean }
  | { error: InsertMovementError; movementId: null };

const INVARIANT_MESSAGE = /stock invariant violation/i;
const IDEMPOTENCY_INDEX = /idempotency/i;

export async function insertStockMovement(
  input: InsertMovementInput,
  auditAction: string,
): Promise<InsertMovementResult> {
  const admin = createAdminSupabase();

  // 1. Idempotency read-through.
  const { data: existing } = await admin
    .from('stock_movements')
    .select('id')
    .eq('idempotency_key', input.idempotency_key)
    .maybeSingle();
  if (existing) {
    return { error: null, movementId: existing.id, replayed: true };
  }

  // 2. Insert.
  const { data: inserted, error } = await admin
    .from('stock_movements')
    .insert({
      campaign_id: input.campaign_id,
      sku_id: input.sku_id,
      from_entity_type: input.from_entity_type,
      from_entity_id: input.from_entity_id,
      to_entity_type: input.to_entity_type,
      to_entity_id: input.to_entity_id,
      quantity: input.quantity,
      movement_kind: input.movement_kind,
      user_id: input.user_id,
      location_id: input.location_id,
      reason: input.reason ?? null,
      idempotency_key: input.idempotency_key,
    })
    .select('id')
    .single();

  if (error || !inserted) {
    // 23505 = unique_violation. Only the idempotency-key index is unique on
    // this table, so a 23505 with an idempotency message means a concurrent
    // retry — re-read and return the peer's row.
    if (error?.code === '23505' && IDEMPOTENCY_INDEX.test(error.message)) {
      const { data: afterRace } = await admin
        .from('stock_movements')
        .select('id')
        .eq('idempotency_key', input.idempotency_key)
        .maybeSingle();
      if (afterRace) {
        return { error: null, movementId: afterRace.id, replayed: true };
      }
    }

    // 23514 = check_violation; the invariant trigger raises this with a
    // 'stock invariant violation' prefix. Differentiate over-consumption
    // (promoter usage) from every other case for i18n purposes.
    if (error?.code === '23514' && INVARIANT_MESSAGE.test(error.message)) {
      const code: InsertMovementError =
        input.movement_kind === 'usage' ? 'over_consumption' : 'insufficient_balance';
      if (code === 'over_consumption' && input.from_entity_id) {
        await emitOverConsumptionAlert({
          campaign_id: input.campaign_id,
          sku_id: input.sku_id,
          promoter_id: input.from_entity_id,
          location_id: input.location_id,
          attempted: input.quantity,
        });
      }
      return { error: code, movementId: null };
    }

    return { error: 'insert_failed', movementId: null };
  }

  // 3. Audit log. Non-fatal if it fails.
  await logAuditEvent({
    actor_id: input.user_id,
    action: auditAction,
    entity: 'stock_movement',
    entity_id: inserted.id,
    after: {
      campaign_id: input.campaign_id,
      sku_id: input.sku_id,
      movement_kind: input.movement_kind,
      from_entity_type: input.from_entity_type,
      from_entity_id: input.from_entity_id,
      to_entity_type: input.to_entity_type,
      to_entity_id: input.to_entity_id,
      quantity: input.quantity,
    },
  });

  return { error: null, movementId: inserted.id, replayed: false };
}

// ============================================================================
// RPC-backed helpers: reallocate + correct
// ============================================================================

export type RpcMovementError =
  | InsertMovementError
  | 'not_authorized'
  | 'original_not_found'
  | 'cannot_correct_correction'
  | 'rpc_failed';

export type ReallocateInput = {
  campaign_id: string;
  sku_id: string;
  from_entity_type: 'supervisor' | 'location';
  from_entity_id: string;
  to_entity_type: 'supervisor' | 'location';
  to_entity_id: string;
  quantity: number;
  user_id: string;
  location_id: string | null;
  reason: string | null;
  idempotency_key: string;
};

export type ReallocateResult =
  | { error: null; movementId: string; replayed: boolean }
  | { error: RpcMovementError; movementId: null };

/**
 * Calls the `reallocate_stock` RPC (SECURITY DEFINER in SQL). The RPC
 * itself handles authz + idempotency + the BEFORE INSERT invariant trigger;
 * this helper translates Postgres error codes into typed application
 * errors consistent with `insertStockMovement`.
 *
 * The replayed flag reflects whether the RPC found an existing row with
 * the same idempotency_key rather than inserting a new one. We detect
 * replays by re-reading the movement's created_at AFTER the call; if it
 * predates the call's start by more than a second, it was a replay.
 */
export async function reallocateStock(
  input: ReallocateInput,
  auditAction: string,
): Promise<ReallocateResult> {
  const admin = createAdminSupabase();

  // Pre-check for idempotency replay so we can mark the result accordingly
  // without relying on clock comparisons. If present, short-circuit without
  // calling the RPC at all.
  const { data: priorRow } = await admin
    .from('stock_movements')
    .select('id')
    .eq('idempotency_key', input.idempotency_key)
    .maybeSingle();
  if (priorRow) {
    return { error: null, movementId: priorRow.id, replayed: true };
  }

  const { data, error } = await admin.rpc('reallocate_stock', {
    p_campaign_id: input.campaign_id,
    p_sku_id: input.sku_id,
    p_from_entity_type: input.from_entity_type,
    p_from_entity_id: input.from_entity_id,
    p_to_entity_type: input.to_entity_type,
    p_to_entity_id: input.to_entity_id,
    p_quantity: input.quantity,
    p_user_id: input.user_id,
    // Supabase gen-types treats RPC args as non-nullable; the SQL function
    // tolerates null (params aren't STRICT). Cast keeps types honest.
    p_location_id: input.location_id as string,
    p_reason: input.reason as string,
    p_idempotency_key: input.idempotency_key,
  });

  if (error || !data) {
    const mapped = mapRpcError(error);
    return { error: mapped, movementId: null };
  }

  const movementId = typeof data === 'string' ? data : String(data);

  await logAuditEvent({
    actor_id: input.user_id,
    action: auditAction,
    entity: 'stock_movement',
    entity_id: movementId,
    after: {
      campaign_id: input.campaign_id,
      sku_id: input.sku_id,
      movement_kind: 'reallocation',
      from_entity_type: input.from_entity_type,
      from_entity_id: input.from_entity_id,
      to_entity_type: input.to_entity_type,
      to_entity_id: input.to_entity_id,
      quantity: input.quantity,
    },
  });

  return { error: null, movementId, replayed: false };
}

export type CorrectInput = {
  original_movement_id: string;
  new_quantity: number;
  user_id: string;
  reason: string | null;
  idempotency_key: string;
};

export type CorrectResult =
  | { error: null; reversalId: string; correctedId: string; replayed: boolean }
  | { error: RpcMovementError; reversalId: null; correctedId: null };

/**
 * Calls the `correct_stock_movement` RPC. Inserts a reversal + a corrected
 * restatement row atomically (D-008). Admin-only at the SQL layer.
 */
export async function correctStockMovement(
  input: CorrectInput,
  auditAction: string,
): Promise<CorrectResult> {
  const admin = createAdminSupabase();

  // Idempotency replay pre-check on the REVERSAL row's key (the corrected
  // row uses a derived key). If the reversal exists the pair was already
  // inserted in a prior call.
  const { data: priorReversal } = await admin
    .from('stock_movements')
    .select('id, correction_of')
    .eq('idempotency_key', input.idempotency_key)
    .maybeSingle();
  if (priorReversal && priorReversal.correction_of) {
    const { data: priorCorrected } = await admin
      .from('stock_movements')
      .select('id')
      .eq('correction_of', priorReversal.correction_of)
      .neq('id', priorReversal.id)
      .maybeSingle();
    if (priorCorrected) {
      return {
        error: null,
        reversalId: priorReversal.id,
        correctedId: priorCorrected.id,
        replayed: true,
      };
    }
  }

  const { data, error } = await admin.rpc('correct_stock_movement', {
    p_original_movement_id: input.original_movement_id,
    p_new_quantity: input.new_quantity,
    p_user_id: input.user_id,
    p_reason: input.reason as string,
    p_idempotency_key: input.idempotency_key,
  });

  if (error || !data) {
    const mapped = mapRpcError(error);
    return { error: mapped, reversalId: null, correctedId: null };
  }

  const ids = Array.isArray(data) ? data.map(String) : [];
  if (ids.length !== 2) {
    return { error: 'rpc_failed', reversalId: null, correctedId: null };
  }
  const [reversalId, correctedId] = ids as [string, string];

  await logAuditEvent({
    actor_id: input.user_id,
    action: auditAction,
    entity: 'stock_movement',
    entity_id: input.original_movement_id,
    after: {
      original_movement_id: input.original_movement_id,
      reversal_id: reversalId,
      corrected_id: correctedId,
      new_quantity: input.new_quantity,
    },
  });

  return { error: null, reversalId, correctedId, replayed: false };
}

/**
 * Map a Postgres RPC error to a typed application error.
 *
 *   42501  — insufficient_privilege / explicit authz raise → not_authorized
 *   23503  — foreign_key_violation / RPC "original not found" raise → original_not_found
 *   23514  — check_violation from the invariant trigger → insufficient_balance
 *   22023  — invalid_parameter_value / cannot-correct-correction raise
 */
function mapRpcError(
  err: { code?: string; message?: string } | null,
): RpcMovementError {
  if (!err) return 'rpc_failed';
  const code = err.code ?? '';
  const msg = err.message ?? '';
  if (code === '42501') return 'not_authorized';
  if (code === '23503') return 'original_not_found';
  if (code === '23514' && INVARIANT_MESSAGE.test(msg)) return 'insufficient_balance';
  if (code === '22023') {
    if (/cannot correct a correction/i.test(msg)) return 'cannot_correct_correction';
    return 'rpc_failed';
  }
  return 'rpc_failed';
}

/**
 * Emit a critical `over_consumption` alert when the invariant trigger
 * rejects a usage movement. The alert is what the supervisor dashboard
 * picks up — there is no ledger row to display, so without this the
 * rejection is silent beyond the form-level error toast.
 */
export async function emitOverConsumptionAlert(input: {
  campaign_id: string;
  sku_id: string;
  promoter_id: string;
  location_id: string | null;
  attempted: number;
}): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin.from('alerts').insert({
    alert_type: 'over_consumption',
    severity: 'critical',
    status: 'open',
    user_id: input.promoter_id,
    campaign_id: input.campaign_id,
    location_id: input.location_id,
    message_key: 'alerts.over_consumption',
    message_params: {
      attempted: input.attempted,
      sku_id: input.sku_id,
    },
  });
  if (error) {
    logError('emitOverConsumptionAlert insert failed', {
      db_error: error.message,
      promoter_id: input.promoter_id,
      sku_id: input.sku_id,
    });
  }
}
