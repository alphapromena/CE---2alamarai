'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { requireRole } from '@/lib/auth/guards';
import { returnToSupervisorSchema } from '@/lib/validations/stock';
import {
  insertStockMovement,
  type InsertMovementError,
} from '@/lib/stock/actions-helper';

export type StockActionState = {
  error: InsertMovementError | 'invalid_input' | 'location_not_assigned' | null;
  movementId?: string | null;
  replayed?: boolean;
};

/**
 * Promoter returns unused stock to a supervisor. from = self (the RLS
 * policy also pins from_entity_id = auth.uid() for promoter inserts).
 */
export async function returnToSupervisorAction(
  input: unknown,
): Promise<StockActionState> {
  const actor = await requireRole('promoter');
  const parsed = returnToSupervisorSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_input' };

  if (!actor.assigned_locations.includes(parsed.data.location_id)) {
    return { error: 'location_not_assigned' };
  }

  const result = await insertStockMovement(
    {
      campaign_id: parsed.data.campaign_id,
      sku_id: parsed.data.sku_id,
      from_entity_type: 'promoter',
      from_entity_id: actor.id,
      to_entity_type: 'supervisor',
      to_entity_id: parsed.data.supervisor_id,
      quantity: parsed.data.quantity,
      movement_kind: 'return',
      user_id: actor.id,
      location_id: parsed.data.location_id,
      reason: parsed.data.reason,
      idempotency_key: parsed.data.idempotency_key,
    },
    'promoter.stock_returned_to_supervisor',
  );

  if (result.error) return { error: result.error, movementId: null };

  const locale = await getLocale();
  revalidatePath(`/${locale}/promoter/stock`);
  revalidatePath(`/${locale}/supervisor/stock`);
  revalidatePath(`/${locale}/supervisor/stock/audit`);
  return { error: null, movementId: result.movementId, replayed: result.replayed };
}
