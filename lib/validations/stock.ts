import { z } from 'zod';

/**
 * Stock-movement schemas (Phase 5).
 *
 * Every mutation carries a client-generated UUID v4 `idempotency_key` (D-009).
 * The UNIQUE index `stock_movements_idempotency_key_unique_idx` turns a retry
 * into a read-through that returns the prior row.
 *
 * Quantity is capped at 1 000 000 as a sanity guard — the CE platform moves
 * consumer-retail SKUs, not shipping containers. The DB CHECK only requires
 * `quantity > 0`; the cap is a UX + audit guard (a 7-digit accidental typo
 * would otherwise pass validation).
 */

const id = z.string().uuid();
const idempotencyKey = z.string().uuid();
const quantity = z.coerce.number().int().positive().max(1_000_000);
const reason = z
  .string()
  .trim()
  .max(500)
  .optional()
  .or(z.literal('').transform(() => undefined))
  .nullable();

// ─── Admin: warehouse → supervisor (allocation) ──────────────────────────
export const allocateStockSchema = z
  .object({
    idempotency_key: idempotencyKey,
    campaign_id: id,
    sku_id: id,
    supervisor_id: id,
    quantity,
    // location_id is the warehouse "where it happened" marker — optional.
    location_id: id.nullable().optional(),
    reason,
  })
  .strict();

// ─── Supervisor: supervisor → promoter (distribution) ────────────────────
export const distributeStockSchema = z
  .object({
    idempotency_key: idempotencyKey,
    campaign_id: id,
    sku_id: id,
    promoter_id: id,
    // The store/location where this distribution happened. Required so
    // Phase-7 audit can filter by location and RLS pins supervisor scope.
    location_id: id,
    quantity,
    reason,
  })
  .strict();

// ─── Promoter: promoter → supervisor (return) ────────────────────────────
export const returnToSupervisorSchema = z
  .object({
    idempotency_key: idempotencyKey,
    campaign_id: id,
    sku_id: id,
    supervisor_id: id,
    location_id: id,
    quantity,
    reason,
  })
  .strict();

// ─── Supervisor: supervisor → warehouse (return) ─────────────────────────
export const returnToWarehouseSchema = z
  .object({
    idempotency_key: idempotencyKey,
    campaign_id: id,
    sku_id: id,
    quantity,
    location_id: id.nullable().optional(),
    reason,
  })
  .strict();

// ─── Supervisor: two-leg reallocation (RPC-backed) ───────────────────────
// A reallocation moves stock between two supervisors OR two locations of
// the SAME type. The kind-pair CHECK on stock_movements enforces the
// same-type rule at the DB layer; this schema enforces it client-side
// first so the user gets an actionable error without a round-trip.
//
// supervisor_id pairs require from_entity_type = to_entity_type = 'supervisor';
// location_id pairs require from_entity_type = to_entity_type = 'location'.
export const reallocateStockSchema = z
  .object({
    idempotency_key: idempotencyKey,
    campaign_id: id,
    sku_id: id,
    from_entity_type: z.enum(['supervisor', 'location']),
    from_entity_id: id,
    to_entity_type: z.enum(['supervisor', 'location']),
    to_entity_id: id,
    quantity,
    location_id: id.nullable().optional(),
    reason,
  })
  .strict()
  .refine(
    (v) => v.from_entity_type === v.to_entity_type,
    { message: 'reallocation from/to entity types must match', path: ['to_entity_type'] },
  )
  .refine(
    (v) => !(v.from_entity_type === v.to_entity_type && v.from_entity_id === v.to_entity_id),
    { message: 'reallocation cannot target the same entity', path: ['to_entity_id'] },
  );

// ─── Admin: correction of a prior movement (D-008) ───────────────────────
// Admin-only. Inserts a reversal + a corrected restatement in one
// transaction via the correct_stock_movement RPC.
export const correctMovementSchema = z
  .object({
    idempotency_key: idempotencyKey,
    original_movement_id: id,
    new_quantity: quantity,
    reason,
  })
  .strict();

export type AllocateStockInput = z.infer<typeof allocateStockSchema>;
export type DistributeStockInput = z.infer<typeof distributeStockSchema>;
export type ReturnToSupervisorInput = z.infer<typeof returnToSupervisorSchema>;
export type ReturnToWarehouseInput = z.infer<typeof returnToWarehouseSchema>;
export type ReallocateStockInput = z.infer<typeof reallocateStockSchema>;
export type CorrectMovementInput = z.infer<typeof correctMovementSchema>;
