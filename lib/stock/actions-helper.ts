import 'server-only';

import { createAdminSupabase } from '@/lib/supabase/admin';
import { logAuditEvent } from '@/lib/auth/audit';
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
    console.error('emitOverConsumptionAlert insert failed', {
      message: error.message,
      promoter_id: input.promoter_id,
      sku_id: input.sku_id,
    });
  }
}
