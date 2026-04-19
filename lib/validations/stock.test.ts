import { describe, expect, it } from 'vitest';
import {
  correctMovementSchema,
  reallocateStockSchema,
} from './stock';

// Fixed UUIDs so tests are deterministic and assertable.
const UUID = {
  idem: '11111111-1111-4111-8111-111111111111',
  camp: '22222222-2222-4222-8222-222222222222',
  sku: '33333333-3333-4333-8333-333333333333',
  fromSup: '44444444-4444-4444-8444-444444444444',
  toSup: '55555555-5555-4555-8555-555555555555',
  fromLoc: '66666666-6666-4666-8666-666666666666',
  toLoc: '77777777-7777-4777-8777-777777777777',
  loc: '88888888-8888-4888-8888-888888888888',
  orig: '99999999-9999-4999-8999-999999999999',
} as const;

// ---------------------------------------------------------------------------
// reallocateStockSchema
// ---------------------------------------------------------------------------
describe('reallocateStockSchema', () => {
  const base = {
    idempotency_key: UUID.idem,
    campaign_id: UUID.camp,
    sku_id: UUID.sku,
    from_entity_type: 'supervisor' as const,
    from_entity_id: UUID.fromSup,
    to_entity_type: 'supervisor' as const,
    to_entity_id: UUID.toSup,
    quantity: 50,
    location_id: UUID.loc,
    reason: 'shift coverage',
  };

  it('accepts a supervisor↔supervisor reallocation', () => {
    const out = reallocateStockSchema.safeParse(base);
    expect(out.success).toBe(true);
  });

  it('accepts a location↔location reallocation', () => {
    const out = reallocateStockSchema.safeParse({
      ...base,
      from_entity_type: 'location',
      from_entity_id: UUID.fromLoc,
      to_entity_type: 'location',
      to_entity_id: UUID.toLoc,
    });
    expect(out.success).toBe(true);
  });

  it('accepts null / omitted location_id', () => {
    const out1 = reallocateStockSchema.safeParse({ ...base, location_id: null });
    const out2 = reallocateStockSchema.safeParse({
      ...Object.fromEntries(Object.entries(base).filter(([k]) => k !== 'location_id')),
    });
    expect(out1.success).toBe(true);
    expect(out2.success).toBe(true);
  });

  it('rejects mismatched from/to entity types', () => {
    const out = reallocateStockSchema.safeParse({
      ...base,
      from_entity_type: 'supervisor',
      to_entity_type: 'location',
      to_entity_id: UUID.toLoc,
    });
    expect(out.success).toBe(false);
    if (!out.success) {
      expect(
        out.error.issues.some((i) => i.message.includes('entity types must match')),
      ).toBe(true);
    }
  });

  it('rejects self-target (same entity on both sides)', () => {
    const out = reallocateStockSchema.safeParse({
      ...base,
      to_entity_id: UUID.fromSup,
    });
    expect(out.success).toBe(false);
    if (!out.success) {
      expect(
        out.error.issues.some((i) => i.message.includes('same entity')),
      ).toBe(true);
    }
  });

  it('rejects warehouse / promoter / consumer as entity types', () => {
    for (const t of ['warehouse', 'promoter', 'consumer'] as const) {
      const out = reallocateStockSchema.safeParse({
        ...base,
        from_entity_type: t,
      });
      expect(out.success).toBe(false);
    }
  });

  it('rejects non-positive quantity', () => {
    for (const q of [0, -1, -100]) {
      const out = reallocateStockSchema.safeParse({ ...base, quantity: q });
      expect(out.success).toBe(false);
    }
  });

  it('coerces numeric-string quantity and rejects non-numeric', () => {
    const ok = reallocateStockSchema.safeParse({ ...base, quantity: '25' });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.quantity).toBe(25);

    const bad = reallocateStockSchema.safeParse({ ...base, quantity: 'twenty' });
    expect(bad.success).toBe(false);
  });

  it('rejects quantity above the 1_000_000 cap', () => {
    const out = reallocateStockSchema.safeParse({ ...base, quantity: 1_000_001 });
    expect(out.success).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    const out = reallocateStockSchema.safeParse({
      ...base,
      stealth_field: 'nope',
    });
    expect(out.success).toBe(false);
  });

  it('rejects a non-UUID idempotency key', () => {
    const out = reallocateStockSchema.safeParse({
      ...base,
      idempotency_key: 'not-a-uuid',
    });
    expect(out.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// correctMovementSchema
// ---------------------------------------------------------------------------
describe('correctMovementSchema', () => {
  const base = {
    idempotency_key: UUID.idem,
    original_movement_id: UUID.orig,
    new_quantity: 42,
    reason: 'recount after supervisor visit',
  };

  it('accepts a valid correction request', () => {
    const out = correctMovementSchema.safeParse(base);
    expect(out.success).toBe(true);
  });

  it('accepts omitted reason', () => {
    const { reason: _reason, ...noReason } = base;
    const out = correctMovementSchema.safeParse(noReason);
    expect(out.success).toBe(true);
  });

  it('rejects non-positive new_quantity', () => {
    for (const q of [0, -1]) {
      const out = correctMovementSchema.safeParse({ ...base, new_quantity: q });
      expect(out.success).toBe(false);
    }
  });

  it('rejects non-UUID original_movement_id', () => {
    const out = correctMovementSchema.safeParse({
      ...base,
      original_movement_id: 'not-a-uuid',
    });
    expect(out.success).toBe(false);
  });

  it('rejects reason over 500 chars', () => {
    const out = correctMovementSchema.safeParse({
      ...base,
      reason: 'x'.repeat(501),
    });
    expect(out.success).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    const out = correctMovementSchema.safeParse({
      ...base,
      admin_override: true,
    });
    expect(out.success).toBe(false);
  });
});
