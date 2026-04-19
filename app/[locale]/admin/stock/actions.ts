'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { requireRole } from '@/lib/auth/guards';
import { allocateStockSchema } from '@/lib/validations/stock';
import {
  insertStockMovement,
  type InsertMovementError,
} from '@/lib/stock/actions-helper';

export type StockActionState = {
  error: InsertMovementError | 'invalid_input' | null;
  movementId?: string | null;
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
