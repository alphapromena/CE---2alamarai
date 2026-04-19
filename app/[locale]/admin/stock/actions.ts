'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { requireRole } from '@/lib/auth/guards';
import {
  allocateStockSchema,
  correctMovementSchema,
} from '@/lib/validations/stock';
import {
  correctStockMovement,
  insertStockMovement,
  type InsertMovementError,
  type RpcMovementError,
} from '@/lib/stock/actions-helper';

export type StockActionState = {
  error: InsertMovementError | 'invalid_input' | null;
  movementId?: string | null;
  replayed?: boolean;
};

export type CorrectMovementActionState = {
  error: RpcMovementError | 'invalid_input' | null;
  reversalId?: string | null;
  correctedId?: string | null;
  replayed?: boolean;
};

/**
 * Admin-only: warehouse → supervisor allocation. Opens the ledger for a
 * (campaign, sku, supervisor). Warehouse is infinite (D-022); the invariant
 * trigger does not constrain this leg.
 */
export async function allocateStockAction(input: unknown): Promise<StockActionState> {
  const actor = await requireRole('admin');
  const parsed = allocateStockSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_input' };

  const result = await insertStockMovement(
    {
      campaign_id: parsed.data.campaign_id,
      sku_id: parsed.data.sku_id,
      from_entity_type: 'warehouse',
      from_entity_id: null,
      to_entity_type: 'supervisor',
      to_entity_id: parsed.data.supervisor_id,
      quantity: parsed.data.quantity,
      movement_kind: 'allocation',
      user_id: actor.id,
      location_id: parsed.data.location_id ?? null,
      reason: parsed.data.reason,
      idempotency_key: parsed.data.idempotency_key,
    },
    'admin.stock_allocated',
  );

  if (result.error) {
    return { error: result.error, movementId: null };
  }

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/stock`);
  revalidatePath(`/${locale}/admin/stock/audit`);
  revalidatePath(`/${locale}/supervisor/stock`);
  return { error: null, movementId: result.movementId, replayed: result.replayed };
}

/**
 * Admin-only correction of a prior stock movement (D-008).
 *
 * Inserts a reversal row + a corrected restatement row in one transaction
 * via the `correct_stock_movement` RPC. Both rows have
 * `movement_kind='correction'` and `correction_of=<original.id>`. The
 * original row stays in place — the ledger is append-only.
 *
 * The invariant trigger still fires on BOTH inserts, so a correction that
 * would drive an intermediate entity negative is rejected exactly as a
 * same-shape insert would be.
 */
export async function correctMovementAction(
  input: unknown,
): Promise<CorrectMovementActionState> {
  const actor = await requireRole('admin');
  const parsed = correctMovementSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_input' };

  const result = await correctStockMovement(
    {
      original_movement_id: parsed.data.original_movement_id,
      new_quantity: parsed.data.new_quantity,
      user_id: actor.id,
      reason: parsed.data.reason ?? null,
      idempotency_key: parsed.data.idempotency_key,
    },
    'admin.stock_correction',
  );

  if (result.error) return { error: result.error };

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/stock`);
  revalidatePath(`/${locale}/admin/stock/audit`);
  revalidatePath(`/${locale}/supervisor/stock`);
  revalidatePath(`/${locale}/supervisor/stock/audit`);
  return {
    error: null,
    reversalId: result.reversalId,
    correctedId: result.correctedId,
    replayed: result.replayed,
  };
}
