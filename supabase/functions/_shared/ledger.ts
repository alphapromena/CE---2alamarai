// Slim copy of lib/stock/ledger.ts for Deno Edge Functions.
// Used by the `stock-reconcile` function.
// Update BOTH files together when the ledger math changes.
// lib/stock/ledger.test.ts is the source-of-truth test.
/**
 * Stock ledger — pure functions (Deno mirror of lib/stock/ledger.ts).
 *
 * No I/O, no randomness, no reading of `now()`. A `now: Date` parameter is
 * passed in where needed (the `no_usage` detector) so tests are deterministic.
 *
 * Draft decisions this module assumes:
 *   D-022 — warehouse is infinite in the ledger; `skus.stock_allocated` is
 *           a planning value, not an initial balance.
 *   D-023 — balances are computed from the ledger, not cached.
 *   D-026 — concurrency is guarded at the SQL layer by advisory locks; these
 *           pure functions assume the caller has serialised writes.
 *   D-027 — `kpi_config.no_usage_hours` defaults to 4 when unset.
 */

export const LEDGER_VERSION = 1;

// ============================================================================
// Types
// ============================================================================

export type StockEntityType =
  | 'warehouse'
  | 'supervisor'
  | 'promoter'
  | 'location'
  | 'consumer';

export type StockMovementKind =
  | 'allocation'
  | 'distribution'
  | 'reallocation'
  | 'usage'
  | 'return'
  | 'correction';

export type Movement = {
  id: string;
  campaign_id: string;
  sku_id: string;
  from_entity_type: StockEntityType;
  from_entity_id: string | null;
  to_entity_type: StockEntityType;
  to_entity_id: string | null;
  quantity: number;
  movement_kind: StockMovementKind;
  correction_of?: string | null;
  reallocation_group_id?: string | null;
  created_at?: string;
};

/** Shape of a candidate row the client wants to INSERT. */
export type MovementInput = Omit<Movement, 'id' | 'created_at'>;

export type Balance = {
  campaign_id: string;
  sku_id: string;
  entity_type: StockEntityType;
  entity_id: string | null;
  total_in: number;
  total_out: number;
  balance: number;
};

/** Composite key: `${campaign}|${sku}|${entityType}:${entityId ?? '~'}`. */
export type BalanceKey = string;
export type BalanceMap = Map<BalanceKey, Balance>;

export type ValidationResult =
  | { ok: true }
  | { ok: false; code: ValidationCode; reason: string };

export type ValidationCode =
  | 'quantity_must_be_positive'
  | 'self_loop'
  | 'entity_shape_mismatch'
  | 'correction_shape_mismatch'
  | 'kind_pair_mismatch'
  | 'over_consumption'
  | 'insufficient_balance';

export type AnomalyFlag =
  | {
      kind: 'low_stock';
      campaign_id: string;
      sku_id: string;
      entity_type: StockEntityType;
      entity_id: string | null;
      balance: number;
      threshold: number;
    }
  | {
      kind: 'over_consumption';
      campaign_id: string;
      sku_id: string;
      promoter_id: string;
      attempted: number;
      available: number;
    }
  | {
      kind: 'no_usage';
      campaign_id: string;
      sku_id: string;
      promoter_id: string;
      received: number;
      last_usage_at: string | null;
      hours_since: number | null;
    }
  | {
      kind: 'reconciliation_mismatch';
      campaign_id: string;
      sku_id: string;
      supervisor_id: string;
      expected: number;
      declared: number;
      diff: number;
    };

// ============================================================================
// Key helpers
// ============================================================================

export function entityKey(type: StockEntityType, id: string | null): string {
  return `${type}:${id ?? '~'}`;
}

export function balanceKey(
  campaign_id: string,
  sku_id: string,
  entity_type: StockEntityType,
  entity_id: string | null,
): BalanceKey {
  return `${campaign_id}|${sku_id}|${entityKey(entity_type, entity_id)}`;
}

// ============================================================================
// Balance computation
// ============================================================================

/**
 * Reduce a list of movements into per-(campaign, sku, entity) running
 * balances. Mirrors the `stock_balances` SQL view exactly: both the to-side
 * and the from-side of every movement contribute a row (to-side adds to
 * total_in; from-side adds to total_out).
 *
 * Entries with entity_type = 'warehouse' / 'consumer' use NULL entity_id
 * (collapsed to the sentinel `~` in the key).
 */
export function computeBalances(
  movements: ReadonlyArray<Movement>,
): BalanceMap {
  const map: BalanceMap = new Map();

  const bump = (
    campaign_id: string,
    sku_id: string,
    entity_type: StockEntityType,
    entity_id: string | null,
    direction: 'in' | 'out',
    quantity: number,
  ) => {
    const key = balanceKey(campaign_id, sku_id, entity_type, entity_id);
    let row = map.get(key);
    if (!row) {
      row = {
        campaign_id,
        sku_id,
        entity_type,
        entity_id,
        total_in: 0,
        total_out: 0,
        balance: 0,
      };
      map.set(key, row);
    }
    if (direction === 'in') row.total_in += quantity;
    else row.total_out += quantity;
    row.balance = row.total_in - row.total_out;
  };

  for (const m of movements) {
    if (!Number.isFinite(m.quantity) || m.quantity <= 0) continue;
    bump(m.campaign_id, m.sku_id, m.to_entity_type, m.to_entity_id, 'in', m.quantity);
    bump(m.campaign_id, m.sku_id, m.from_entity_type, m.from_entity_id, 'out', m.quantity);
  }

  return map;
}

export function getBalance(
  balances: BalanceMap,
  campaign_id: string,
  sku_id: string,
  entity_type: StockEntityType,
  entity_id: string | null,
): number {
  return balances.get(balanceKey(campaign_id, sku_id, entity_type, entity_id))?.balance ?? 0;
}

// ============================================================================
// Movement validation
// ============================================================================

const LEGAL_KIND_PAIRS: ReadonlyArray<
  readonly [StockMovementKind, StockEntityType, StockEntityType]
> = [
  ['allocation', 'warehouse', 'supervisor'],
  ['distribution', 'supervisor', 'promoter'],
  ['reallocation', 'supervisor', 'supervisor'],
  ['reallocation', 'location', 'location'],
  ['usage', 'promoter', 'consumer'],
  ['return', 'promoter', 'supervisor'],
  ['return', 'supervisor', 'warehouse'],
];

function isAbstractEntity(type: StockEntityType): boolean {
  return type === 'warehouse' || type === 'consumer';
}

/**
 * Pure validation — matches the BEFORE INSERT trigger + CHECK constraints on
 * `stock_movements`. Call this on the Server Action path before the DB write
 * so the user gets an actionable error without relying on SQLSTATE decoding.
 *
 * Callers pass the CURRENT balances (reduced from already-committed rows);
 * this function checks whether the proposed movement would drive the from-
 * entity's balance negative. Warehouse is exempt (infinite source, D-022).
 *
 * Corrections (`movement_kind = 'correction'`) are NOT exempt: a correction
 * that would take the from-entity negative is itself an error.
 */
export function validateMovement(
  input: MovementInput,
  balances: BalanceMap,
): ValidationResult {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return {
      ok: false,
      code: 'quantity_must_be_positive',
      reason: 'quantity must be a positive finite integer',
    };
  }

  // Entity-shape: warehouse/consumer must have NULL ids; other types must have IDs.
  if (isAbstractEntity(input.from_entity_type) !== (input.from_entity_id === null)) {
    return {
      ok: false,
      code: 'entity_shape_mismatch',
      reason: `from_entity_id must be ${isAbstractEntity(input.from_entity_type) ? 'NULL' : 'set'} for from_entity_type=${input.from_entity_type}`,
    };
  }
  if (isAbstractEntity(input.to_entity_type) !== (input.to_entity_id === null)) {
    return {
      ok: false,
      code: 'entity_shape_mismatch',
      reason: `to_entity_id must be ${isAbstractEntity(input.to_entity_type) ? 'NULL' : 'set'} for to_entity_type=${input.to_entity_type}`,
    };
  }

  // Self-loop: from == to is never a valid movement.
  if (
    input.from_entity_type === input.to_entity_type &&
    input.from_entity_id === input.to_entity_id
  ) {
    return {
      ok: false,
      code: 'self_loop',
      reason: 'from and to cannot refer to the same entity',
    };
  }

  // Correction shape: correction_of set iff kind=correction.
  const hasCorrectionRef = input.correction_of != null;
  if ((input.movement_kind === 'correction') !== hasCorrectionRef) {
    return {
      ok: false,
      code: 'correction_shape_mismatch',
      reason:
        input.movement_kind === 'correction'
          ? "movement_kind='correction' requires correction_of to be set"
          : 'correction_of may only be set when movement_kind = correction',
    };
  }

  // Kind ↔ (from_type, to_type): corrections skip this since they can mirror any shape.
  if (input.movement_kind !== 'correction') {
    const legal = LEGAL_KIND_PAIRS.some(
      ([k, f, t]) =>
        k === input.movement_kind &&
        f === input.from_entity_type &&
        t === input.to_entity_type,
    );
    if (!legal) {
      return {
        ok: false,
        code: 'kind_pair_mismatch',
        reason: `illegal (from, to) pair for movement_kind=${input.movement_kind}: ${input.from_entity_type}→${input.to_entity_type}`,
      };
    }
  }

  // Balance check: warehouse is exempt (infinite source).
  if (input.from_entity_type !== 'warehouse') {
    const current = getBalance(
      balances,
      input.campaign_id,
      input.sku_id,
      input.from_entity_type,
      input.from_entity_id,
    );
    if (current < input.quantity) {
      const code: ValidationCode =
        input.movement_kind === 'usage' ? 'over_consumption' : 'insufficient_balance';
      return {
        ok: false,
        code,
        reason: `from-entity ${input.from_entity_type}/${input.from_entity_id ?? '∅'} has balance ${current}, cannot transfer ${input.quantity}`,
      };
    }
  }

  return { ok: true };
}

// ============================================================================
// Anomaly detection
// ============================================================================

export type AnomalyThresholds = {
  /** Any non-warehouse balance ≤ this value raises low_stock. */
  low_stock_threshold: number;
  /** Hours since last usage before no_usage fires (when balance > 0). */
  no_usage_hours: number;
};

export const DEFAULT_ANOMALY_THRESHOLDS: AnomalyThresholds = {
  low_stock_threshold: 10,
  no_usage_hours: 4,
};

/**
 * Read `kpi_config.no_usage_hours` (draft D-027). Unknown / non-numeric /
 * non-positive values fall back to the default.
 */
export function readNoUsageHours(kpiConfig: unknown): number {
  if (kpiConfig && typeof kpiConfig === 'object') {
    const raw = (kpiConfig as Record<string, unknown>).no_usage_hours;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  }
  return DEFAULT_ANOMALY_THRESHOLDS.no_usage_hours;
}

/** Read `kpi_config.low_stock_threshold`; non-negative numbers accepted (0 = disabled). */
export function readLowStockThreshold(kpiConfig: unknown): number {
  if (kpiConfig && typeof kpiConfig === 'object') {
    const raw = (kpiConfig as Record<string, unknown>).low_stock_threshold;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw;
  }
  return DEFAULT_ANOMALY_THRESHOLDS.low_stock_threshold;
}

export type NoUsageInput = {
  campaign_id: string;
  sku_id: string;
  promoter_id: string;
  received: number;
  last_usage_at: string | null;
};

/**
 * Low-stock detector: any non-warehouse, non-consumer entity balance > 0
 * and ≤ threshold raises a flag. A balance of exactly 0 does NOT fire
 * (entity is empty, not "running low"); the reconcile Edge Function can
 * choose to flag zero-balance separately if desired.
 */
export function detectLowStock(
  balances: BalanceMap,
  thresholds: Pick<AnomalyThresholds, 'low_stock_threshold'>,
): AnomalyFlag[] {
  const out: AnomalyFlag[] = [];
  if (thresholds.low_stock_threshold <= 0) return out;
  for (const b of balances.values()) {
    if (b.entity_type === 'warehouse' || b.entity_type === 'consumer') continue;
    if (b.balance > 0 && b.balance <= thresholds.low_stock_threshold) {
      out.push({
        kind: 'low_stock',
        campaign_id: b.campaign_id,
        sku_id: b.sku_id,
        entity_type: b.entity_type,
        entity_id: b.entity_id,
        balance: b.balance,
        threshold: thresholds.low_stock_threshold,
      });
    }
  }
  return out;
}

/**
 * No-usage detector: for each promoter with received > 0, fire if
 *   - last_usage_at is null (no usage ever logged), OR
 *   - (now - last_usage_at) > no_usage_hours.
 */
export function detectNoUsage(
  inputs: ReadonlyArray<NoUsageInput>,
  thresholds: Pick<AnomalyThresholds, 'no_usage_hours'>,
  now: Date,
): AnomalyFlag[] {
  const out: AnomalyFlag[] = [];
  const thresholdMs = thresholds.no_usage_hours * 60 * 60 * 1000;
  for (const row of inputs) {
    if (row.received <= 0) continue;
    let hoursSince: number | null = null;
    let fire = false;
    if (row.last_usage_at === null) {
      fire = true;
    } else {
      const parsed = Date.parse(row.last_usage_at);
      if (!Number.isFinite(parsed)) {
        fire = true;
      } else {
        const diffMs = now.getTime() - parsed;
        hoursSince = diffMs / (60 * 60 * 1000);
        fire = diffMs > thresholdMs;
      }
    }
    if (fire) {
      out.push({
        kind: 'no_usage',
        campaign_id: row.campaign_id,
        sku_id: row.sku_id,
        promoter_id: row.promoter_id,
        received: row.received,
        last_usage_at: row.last_usage_at,
        hours_since: hoursSince,
      });
    }
  }
  return out;
}

export type ReconciliationDeclaration = {
  supervisor_id: string;
  campaign_id: string;
  sku_id: string;
  /** Supervisor-declared count of units still held (by the supervisor + her promoters). */
  declared_on_hand: number;
};

/**
 * Reconciliation-mismatch detector: compares a supervisor's declared on-hand
 * total against the ledger's computed on-hand for the same (campaign, sku)
 * scope. On-hand = supervisor's balance + Σ balance of every promoter
 * visible via the declaration scope (passed in by the caller as `promoter_ids`).
 *
 * Returns one flag per mismatching SKU.
 */
export function detectReconciliationMismatch(
  declarations: ReadonlyArray<ReconciliationDeclaration & { promoter_ids: ReadonlyArray<string> }>,
  balances: BalanceMap,
): AnomalyFlag[] {
  const out: AnomalyFlag[] = [];
  for (const d of declarations) {
    const supBalance = getBalance(balances, d.campaign_id, d.sku_id, 'supervisor', d.supervisor_id);
    const promoterBalances = d.promoter_ids.reduce(
      (sum, pid) => sum + getBalance(balances, d.campaign_id, d.sku_id, 'promoter', pid),
      0,
    );
    const expected = supBalance + promoterBalances;
    if (expected !== d.declared_on_hand) {
      out.push({
        kind: 'reconciliation_mismatch',
        campaign_id: d.campaign_id,
        sku_id: d.sku_id,
        supervisor_id: d.supervisor_id,
        expected,
        declared: d.declared_on_hand,
        diff: d.declared_on_hand - expected,
      });
    }
  }
  return out;
}

// ============================================================================
// Ledger invariant check (identities from PLAN.md §4)
// ============================================================================

export type InvariantViolation = {
  code: 'warehouse_issued_mismatch' | 'supervisor_identity' | 'promoter_identity';
  campaign_id: string;
  sku_id: string;
  entity_id: string | null;
  lhs: number;
  rhs: number;
  detail: string;
};

/**
 * Walks every (campaign, sku, supervisor) and (campaign, sku, promoter)
 * balance row and checks the conservation identities:
 *
 *   warehouse_issued = Σ supervisor_received_from_warehouse  (per campaign, sku)
 *   supervisor_received = supervisor_distributed + supervisor_remaining + supervisor_returned
 *   promoter_received   = promoter_used + promoter_remaining + promoter_returned
 *
 * These are IDENTITIES by construction of the ledger (total_in = Σ receipts;
 * total_out = Σ dispatches; balance = remaining; the identity rewrites as
 * 0 = 0). The function is therefore primarily a regression guard: if a
 * future migration changes the ledger shape and the identity no longer holds,
 * this function will surface it. Any non-empty return is a bug.
 */
export function checkInvariants(
  movements: ReadonlyArray<Movement>,
  balances: BalanceMap,
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  for (const b of balances.values()) {
    if (b.entity_type !== 'supervisor' && b.entity_type !== 'promoter') continue;
    const computed = b.total_in - b.total_out;
    if (computed !== b.balance) {
      violations.push({
        code: b.entity_type === 'supervisor' ? 'supervisor_identity' : 'promoter_identity',
        campaign_id: b.campaign_id,
        sku_id: b.sku_id,
        entity_id: b.entity_id,
        lhs: b.balance,
        rhs: computed,
        detail: `${b.entity_type} balance drift`,
      });
    }
  }

  // Cross-check #1: Σ warehouse-sourced inflows to all supervisors for
  // (campaign, sku) equals warehouse's total outflow for that (campaign, sku),
  // minus any correction rows that moved from supervisor back to warehouse.
  type Pair = { campaign_id: string; sku_id: string };
  const byCampSku = new Map<string, { warehouseOut: number; supervisorInFromWarehouse: number; ref: Pair }>();
  for (const m of movements) {
    const key = `${m.campaign_id}|${m.sku_id}`;
    let slot = byCampSku.get(key);
    if (!slot) {
      slot = {
        warehouseOut: 0,
        supervisorInFromWarehouse: 0,
        ref: { campaign_id: m.campaign_id, sku_id: m.sku_id },
      };
      byCampSku.set(key, slot);
    }
    if (m.from_entity_type === 'warehouse') {
      slot.warehouseOut += m.quantity;
      if (m.to_entity_type === 'supervisor') slot.supervisorInFromWarehouse += m.quantity;
    }
  }
  for (const [, slot] of byCampSku) {
    if (slot.warehouseOut !== slot.supervisorInFromWarehouse) {
      violations.push({
        code: 'warehouse_issued_mismatch',
        campaign_id: slot.ref.campaign_id,
        sku_id: slot.ref.sku_id,
        entity_id: null,
        lhs: slot.warehouseOut,
        rhs: slot.supervisorInFromWarehouse,
        detail: 'warehouse outflow does not equal supervisor inflow from warehouse',
      });
    }
  }

  return violations;
}
