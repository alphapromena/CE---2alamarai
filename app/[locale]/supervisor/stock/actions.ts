'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
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
