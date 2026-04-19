import { describe, expect, it } from 'vitest';
import {
  LEDGER_VERSION,
  balanceKey,
  checkInvariants,
  computeBalances,
  DEFAULT_ANOMALY_THRESHOLDS,
  detectLowStock,
  detectNoUsage,
  detectReconciliationMismatch,
  entityKey,
  getBalance,
  readLowStockThreshold,
  readNoUsageHours,
  validateMovement,
  type Movement,
  type MovementInput,
} from './ledger';

// ============================================================================
// Ground truth — Almarai yoghurt-cup scenario from CE spec §6 (pp. 13–14).
//
//   Warehouse → Supervisor A (Amman): 1000 yogurt cups + 200 giveaways
//   Supervisor A → Safeway Jubeiha promoter: 300 / 60
//   Supervisor A → C-Town promoter:          300 / 60
//   Supervisor A → Cozmo promoter:           400 / 80
//
//   Usage reported:
//     Jubeiha 250 used, 50 remaining
//     C-Town  280 used, 20 remaining
//     Cozmo   420 reported — OVER (only 400 received)
//
//   System REJECTS the 420 usage (PLAN §4: promoter_used ≤ promoter_received
//   is a hard reject, not a flag). The `over_consumption` anomaly is raised
//   at the point of rejection. Supervisor reconciles by either correcting
//   the report to 400 or allocating more stock.
//
//   After resolution: used + remaining + returned = 1000.
// ============================================================================
const CAMPAIGN = 'cmp-almarai-2026';
const SKU_CUPS = 'sku-yogurt-cups';
const SKU_GIVEAWAYS = 'sku-giveaways';
const SUPERVISOR_A = 'sup-a-amman';
const JUBEIHA = 'pro-jubeiha';
const CTOWN = 'pro-ctown';
const COZMO = 'pro-cozmo';

let nextSeq = 1;
const mv = (m: Omit<Movement, 'id' | 'created_at'>): Movement => ({
  ...m,
  id: `mv-${String(nextSeq++).padStart(4, '0')}`,
  created_at: new Date(Date.UTC(2026, 3, 20, 8, 0, 0) + nextSeq * 1000).toISOString(),
});

function resetSeq() {
  nextSeq = 1;
}

function buildAlmaraiLedger(): Movement[] {
  resetSeq();
  return [
    // 1. Warehouse → Supervisor A: 1000 cups + 200 giveaways
    mv({
      campaign_id: CAMPAIGN,
      sku_id: SKU_CUPS,
      from_entity_type: 'warehouse',
      from_entity_id: null,
      to_entity_type: 'supervisor',
      to_entity_id: SUPERVISOR_A,
      quantity: 1000,
      movement_kind: 'allocation',
    }),
    mv({
      campaign_id: CAMPAIGN,
      sku_id: SKU_GIVEAWAYS,
      from_entity_type: 'warehouse',
      from_entity_id: null,
      to_entity_type: 'supervisor',
      to_entity_id: SUPERVISOR_A,
      quantity: 200,
      movement_kind: 'allocation',
    }),
    // 2. Distribution to the three promoters — cups
    mv({
      campaign_id: CAMPAIGN,
      sku_id: SKU_CUPS,
      from_entity_type: 'supervisor',
      from_entity_id: SUPERVISOR_A,
      to_entity_type: 'promoter',
      to_entity_id: JUBEIHA,
      quantity: 300,
      movement_kind: 'distribution',
    }),
    mv({
      campaign_id: CAMPAIGN,
      sku_id: SKU_CUPS,
      from_entity_type: 'supervisor',
      from_entity_id: SUPERVISOR_A,
      to_entity_type: 'promoter',
      to_entity_id: CTOWN,
      quantity: 300,
      movement_kind: 'distribution',
    }),
    mv({
      campaign_id: CAMPAIGN,
      sku_id: SKU_CUPS,
      from_entity_type: 'supervisor',
      from_entity_id: SUPERVISOR_A,
      to_entity_type: 'promoter',
      to_entity_id: COZMO,
      quantity: 400,
      movement_kind: 'distribution',
    }),
    // 2b. Distribution — giveaways
    mv({
      campaign_id: CAMPAIGN,
      sku_id: SKU_GIVEAWAYS,
      from_entity_type: 'supervisor',
      from_entity_id: SUPERVISOR_A,
      to_entity_type: 'promoter',
      to_entity_id: JUBEIHA,
      quantity: 60,
      movement_kind: 'distribution',
    }),
    mv({
      campaign_id: CAMPAIGN,
      sku_id: SKU_GIVEAWAYS,
      from_entity_type: 'supervisor',
      from_entity_id: SUPERVISOR_A,
      to_entity_type: 'promoter',
      to_entity_id: CTOWN,
      quantity: 60,
      movement_kind: 'distribution',
    }),
    mv({
      campaign_id: CAMPAIGN,
      sku_id: SKU_GIVEAWAYS,
      from_entity_type: 'supervisor',
      from_entity_id: SUPERVISOR_A,
      to_entity_type: 'promoter',
      to_entity_id: COZMO,
      quantity: 80,
      movement_kind: 'distribution',
    }),
    // 3. Usage reports — Jubeiha 250, C-Town 280. Cozmo 420 is attempted
    //    but REJECTED by validateMovement; the test below proves that.
    mv({
      campaign_id: CAMPAIGN,
      sku_id: SKU_CUPS,
      from_entity_type: 'promoter',
      from_entity_id: JUBEIHA,
      to_entity_type: 'consumer',
      to_entity_id: null,
      quantity: 250,
      movement_kind: 'usage',
    }),
    mv({
      campaign_id: CAMPAIGN,
      sku_id: SKU_CUPS,
      from_entity_type: 'promoter',
      from_entity_id: CTOWN,
      to_entity_type: 'consumer',
      to_entity_id: null,
      quantity: 280,
      movement_kind: 'usage',
    }),
  ];
}

// ============================================================================
// computeBalances — Almarai scenario
// ============================================================================

describe('computeBalances — Almarai scenario', () => {
  const movements = buildAlmaraiLedger();
  const balances = computeBalances(movements);

  it('warehouse cup outflow = 1000', () => {
    const warehouseCups = balances.get(balanceKey(CAMPAIGN, SKU_CUPS, 'warehouse', null));
    expect(warehouseCups?.total_out).toBe(1000);
    expect(warehouseCups?.total_in).toBe(0);
  });

  it('supervisor A cup balance = 0 (distributed all 1000)', () => {
    expect(getBalance(balances, CAMPAIGN, SKU_CUPS, 'supervisor', SUPERVISOR_A)).toBe(0);
  });

  it('Jubeiha cup balance = 50 (300 received, 250 used)', () => {
    expect(getBalance(balances, CAMPAIGN, SKU_CUPS, 'promoter', JUBEIHA)).toBe(50);
  });

  it('C-Town cup balance = 20 (300 received, 280 used)', () => {
    expect(getBalance(balances, CAMPAIGN, SKU_CUPS, 'promoter', CTOWN)).toBe(20);
  });

  it('Cozmo cup balance = 400 (received, no usage committed yet)', () => {
    // Cozmo's 420 attempt is NOT in the ledger — validateMovement rejects it
    // before INSERT. The test below asserts the rejection directly.
    expect(getBalance(balances, CAMPAIGN, SKU_CUPS, 'promoter', COZMO)).toBe(400);
  });

  it('supervisor A giveaway balance = 0 (all distributed)', () => {
    expect(getBalance(balances, CAMPAIGN, SKU_GIVEAWAYS, 'supervisor', SUPERVISOR_A)).toBe(0);
  });
});

// ============================================================================
// validateMovement — Cozmo over-consumption attempt
// ============================================================================

describe('validateMovement — over-consumption REJECT', () => {
  const movements = buildAlmaraiLedger();
  const balances = computeBalances(movements);

  it('rejects Cozmo usage 420 with code=over_consumption', () => {
    const result = validateMovement(
      {
        campaign_id: CAMPAIGN,
        sku_id: SKU_CUPS,
        from_entity_type: 'promoter',
        from_entity_id: COZMO,
        to_entity_type: 'consumer',
        to_entity_id: null,
        quantity: 420,
        movement_kind: 'usage',
      },
      balances,
    );
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.code).toBe('over_consumption');
      expect(result.reason).toContain('400');
      expect(result.reason).toContain('420');
    }
  });

  it('accepts Cozmo usage 400 (corrected down)', () => {
    expect(
      validateMovement(
        {
          campaign_id: CAMPAIGN,
          sku_id: SKU_CUPS,
          from_entity_type: 'promoter',
          from_entity_id: COZMO,
          to_entity_type: 'consumer',
          to_entity_id: null,
          quantity: 400,
          movement_kind: 'usage',
        },
        balances,
      ).ok,
    ).toBe(true);
  });

  it('accepts Cozmo usage 100 (partial, within balance)', () => {
    expect(
      validateMovement(
        {
          campaign_id: CAMPAIGN,
          sku_id: SKU_CUPS,
          from_entity_type: 'promoter',
          from_entity_id: COZMO,
          to_entity_type: 'consumer',
          to_entity_id: null,
          quantity: 100,
          movement_kind: 'usage',
        },
        balances,
      ).ok,
    ).toBe(true);
  });
});

// ============================================================================
// EXIT CRITERION — full scenario reconciliation = 1000 exactly
// ============================================================================

describe('Almarai EXIT CRITERION — 1000 cups conserved after resolution', () => {
  it('after Cozmo corrects to 400, total used + remaining + returned = 1000', () => {
    const movements = buildAlmaraiLedger();
    // Resolution path (a): Cozmo re-reports corrected usage = 400 (not 420)
    movements.push(
      mv({
        campaign_id: CAMPAIGN,
        sku_id: SKU_CUPS,
        from_entity_type: 'promoter',
        from_entity_id: COZMO,
        to_entity_type: 'consumer',
        to_entity_id: null,
        quantity: 400,
        movement_kind: 'usage',
      }),
    );
    const balances = computeBalances(movements);

    // Total consumed (consumer inflow) across all promoters
    const consumerInflow =
      balances.get(balanceKey(CAMPAIGN, SKU_CUPS, 'consumer', null))?.total_in ?? 0;
    // Total still on-hand at promoters
    const jubeihaRem = getBalance(balances, CAMPAIGN, SKU_CUPS, 'promoter', JUBEIHA);
    const ctownRem = getBalance(balances, CAMPAIGN, SKU_CUPS, 'promoter', CTOWN);
    const cozmoRem = getBalance(balances, CAMPAIGN, SKU_CUPS, 'promoter', COZMO);
    // Total still with the supervisor
    const supRem = getBalance(balances, CAMPAIGN, SKU_CUPS, 'supervisor', SUPERVISOR_A);
    // Total returned to warehouse
    const warehouseBalance = balances.get(balanceKey(CAMPAIGN, SKU_CUPS, 'warehouse', null));
    const returned = warehouseBalance?.total_in ?? 0;

    expect(consumerInflow).toBe(930); // 250 + 280 + 400
    expect(jubeihaRem + ctownRem + cozmoRem).toBe(70); // 50 + 20 + 0
    expect(supRem).toBe(0);
    expect(returned).toBe(0);

    const total = consumerInflow + jubeihaRem + ctownRem + cozmoRem + supRem + returned;
    expect(total).toBe(1000);
  });

  it('alternate resolution — supervisor allocates +20 extra to Cozmo, 420 used', () => {
    const movements = buildAlmaraiLedger();
    // Resolution path (b): admin allocates 20 more cups (W→SupA→Cozmo),
    // then Cozmo's 420 usage is valid. Total now = 1020.
    movements.push(
      mv({
        campaign_id: CAMPAIGN,
        sku_id: SKU_CUPS,
        from_entity_type: 'warehouse',
        from_entity_id: null,
        to_entity_type: 'supervisor',
        to_entity_id: SUPERVISOR_A,
        quantity: 20,
        movement_kind: 'allocation',
      }),
      mv({
        campaign_id: CAMPAIGN,
        sku_id: SKU_CUPS,
        from_entity_type: 'supervisor',
        from_entity_id: SUPERVISOR_A,
        to_entity_type: 'promoter',
        to_entity_id: COZMO,
        quantity: 20,
        movement_kind: 'distribution',
      }),
      mv({
        campaign_id: CAMPAIGN,
        sku_id: SKU_CUPS,
        from_entity_type: 'promoter',
        from_entity_id: COZMO,
        to_entity_type: 'consumer',
        to_entity_id: null,
        quantity: 420,
        movement_kind: 'usage',
      }),
    );
    const balances = computeBalances(movements);
    const consumed = balances.get(balanceKey(CAMPAIGN, SKU_CUPS, 'consumer', null))?.total_in ?? 0;
    expect(consumed).toBe(950); // 250 + 280 + 420
    expect(getBalance(balances, CAMPAIGN, SKU_CUPS, 'promoter', COZMO)).toBe(0);
  });
});

// ============================================================================
// checkInvariants — identities hold for the Almarai ledger
// ============================================================================

describe('checkInvariants — conservation identities', () => {
  it('holds on an empty ledger', () => {
    const balances = computeBalances([]);
    expect(checkInvariants([], balances)).toHaveLength(0);
  });

  it('holds for the Almarai scenario (pre-resolution)', () => {
    const movements = buildAlmaraiLedger();
    const balances = computeBalances(movements);
    expect(checkInvariants(movements, balances)).toHaveLength(0);
  });
});

// ============================================================================
// validateMovement — structural checks
// ============================================================================

const OK_INPUT: MovementInput = {
  campaign_id: 'c',
  sku_id: 's',
  from_entity_type: 'warehouse',
  from_entity_id: null,
  to_entity_type: 'supervisor',
  to_entity_id: SUPERVISOR_A,
  quantity: 10,
  movement_kind: 'allocation',
};

describe('validateMovement — structural rules', () => {
  const empty = computeBalances([]);

  it('accepts a well-formed warehouse allocation', () => {
    expect(validateMovement(OK_INPUT, empty).ok).toBe(true);
  });

  it('rejects quantity <= 0', () => {
    const out = validateMovement({ ...OK_INPUT, quantity: 0 }, empty);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe('quantity_must_be_positive');
  });

  it('rejects non-finite quantity', () => {
    const out = validateMovement({ ...OK_INPUT, quantity: Number.NaN }, empty);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe('quantity_must_be_positive');
  });

  it('rejects warehouse with a non-null from_entity_id', () => {
    const out = validateMovement(
      { ...OK_INPUT, from_entity_id: 'something' },
      empty,
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe('entity_shape_mismatch');
  });

  it('rejects supervisor with null to_entity_id', () => {
    const out = validateMovement({ ...OK_INPUT, to_entity_id: null }, empty);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe('entity_shape_mismatch');
  });

  it('rejects self-loop (from == to)', () => {
    const out = validateMovement(
      {
        campaign_id: 'c',
        sku_id: 's',
        from_entity_type: 'supervisor',
        from_entity_id: SUPERVISOR_A,
        to_entity_type: 'supervisor',
        to_entity_id: SUPERVISOR_A,
        quantity: 10,
        movement_kind: 'reallocation',
      },
      empty,
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe('self_loop');
  });

  it('rejects kind=correction without correction_of', () => {
    const out = validateMovement(
      { ...OK_INPUT, movement_kind: 'correction' },
      empty,
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe('correction_shape_mismatch');
  });

  it('rejects correction_of on non-correction kind', () => {
    const out = validateMovement({ ...OK_INPUT, correction_of: 'mv-xxx' }, empty);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe('correction_shape_mismatch');
  });

  it('rejects illegal (from, to) pair', () => {
    const out = validateMovement(
      {
        campaign_id: 'c',
        sku_id: 's',
        from_entity_type: 'promoter',
        from_entity_id: JUBEIHA,
        to_entity_type: 'warehouse',
        to_entity_id: null,
        quantity: 10,
        movement_kind: 'return',
      },
      empty,
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe('kind_pair_mismatch');
  });

  it('rejects supervisor distribution without a prior allocation (insufficient_balance)', () => {
    const out = validateMovement(
      {
        campaign_id: 'c',
        sku_id: 's',
        from_entity_type: 'supervisor',
        from_entity_id: SUPERVISOR_A,
        to_entity_type: 'promoter',
        to_entity_id: JUBEIHA,
        quantity: 10,
        movement_kind: 'distribution',
      },
      empty,
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe('insufficient_balance');
  });
});

// ============================================================================
// detectLowStock
// ============================================================================

describe('detectLowStock', () => {
  it('flags a supervisor whose balance is at or below threshold', () => {
    const movements = [
      mv({
        campaign_id: CAMPAIGN,
        sku_id: SKU_CUPS,
        from_entity_type: 'warehouse',
        from_entity_id: null,
        to_entity_type: 'supervisor',
        to_entity_id: SUPERVISOR_A,
        quantity: 5,
        movement_kind: 'allocation',
      }),
    ];
    const balances = computeBalances(movements);
    const flags = detectLowStock(balances, { low_stock_threshold: 10 });
    expect(flags).toHaveLength(1);
    const flag = flags[0];
    if (flag && flag.kind === 'low_stock') {
      expect(flag.balance).toBe(5);
      expect(flag.threshold).toBe(10);
    } else {
      expect.fail('expected a low_stock flag');
    }
  });

  it('does not flag balance = 0 (empty, not low)', () => {
    const balances = computeBalances(buildAlmaraiLedger());
    const flags = detectLowStock(balances, { low_stock_threshold: 10 });
    // supervisor A has 0 for cups and 0 for giveaways — should NOT appear
    const supervisorFlags = flags.filter(
      (f) => f.kind === 'low_stock' && f.entity_id === SUPERVISOR_A,
    );
    expect(supervisorFlags).toHaveLength(0);
  });

  it('flags C-Town cups (20) under a threshold of 30', () => {
    const balances = computeBalances(buildAlmaraiLedger());
    const flags = detectLowStock(balances, { low_stock_threshold: 30 });
    const ctownCupsFlag = flags.find(
      (f) => f.kind === 'low_stock' && f.entity_id === CTOWN && f.sku_id === SKU_CUPS,
    );
    expect(ctownCupsFlag).toBeDefined();
  });

  it('threshold ≤ 0 disables the detector', () => {
    const balances = computeBalances(buildAlmaraiLedger());
    expect(detectLowStock(balances, { low_stock_threshold: 0 })).toHaveLength(0);
    expect(detectLowStock(balances, { low_stock_threshold: -5 })).toHaveLength(0);
  });
});

// ============================================================================
// detectNoUsage
// ============================================================================

describe('detectNoUsage', () => {
  const now = new Date('2026-04-20T14:00:00.000Z');

  it('flags a promoter with received > 0 and NULL last_usage_at', () => {
    const flags = detectNoUsage(
      [
        {
          campaign_id: CAMPAIGN,
          sku_id: SKU_CUPS,
          promoter_id: COZMO,
          received: 400,
          last_usage_at: null,
        },
      ],
      { no_usage_hours: 4 },
      now,
    );
    expect(flags).toHaveLength(1);
    const flag = flags[0];
    if (flag && flag.kind === 'no_usage') {
      expect(flag.hours_since).toBeNull();
      expect(flag.received).toBe(400);
    } else {
      expect.fail('expected a no_usage flag');
    }
  });

  it('flags a promoter whose last_usage_at is older than the threshold', () => {
    const flags = detectNoUsage(
      [
        {
          campaign_id: CAMPAIGN,
          sku_id: SKU_CUPS,
          promoter_id: CTOWN,
          received: 300,
          last_usage_at: '2026-04-20T08:00:00.000Z', // 6 hours ago
        },
      ],
      { no_usage_hours: 4 },
      now,
    );
    expect(flags).toHaveLength(1);
    const flag = flags[0];
    if (flag && flag.kind === 'no_usage') {
      expect(flag.hours_since).toBeCloseTo(6, 2);
    } else {
      expect.fail('expected a no_usage flag');
    }
  });

  it('does not flag a promoter who used recently', () => {
    const flags = detectNoUsage(
      [
        {
          campaign_id: CAMPAIGN,
          sku_id: SKU_CUPS,
          promoter_id: JUBEIHA,
          received: 300,
          last_usage_at: '2026-04-20T13:00:00.000Z', // 1 hour ago
        },
      ],
      { no_usage_hours: 4 },
      now,
    );
    expect(flags).toHaveLength(0);
  });

  it('does not flag promoters who never received stock', () => {
    const flags = detectNoUsage(
      [
        {
          campaign_id: CAMPAIGN,
          sku_id: SKU_CUPS,
          promoter_id: 'new-promoter',
          received: 0,
          last_usage_at: null,
        },
      ],
      { no_usage_hours: 4 },
      now,
    );
    expect(flags).toHaveLength(0);
  });
});

// ============================================================================
// detectReconciliationMismatch
// ============================================================================

describe('detectReconciliationMismatch', () => {
  it('no flag when declared = ledger', () => {
    const balances = computeBalances(buildAlmaraiLedger());
    const flags = detectReconciliationMismatch(
      [
        {
          supervisor_id: SUPERVISOR_A,
          campaign_id: CAMPAIGN,
          sku_id: SKU_CUPS,
          promoter_ids: [JUBEIHA, CTOWN, COZMO],
          declared_on_hand: 0 + 50 + 20 + 400, // sup rem + J + C + Cozmo (pre-resolution)
        },
      ],
      balances,
    );
    expect(flags).toHaveLength(0);
  });

  it('flags a mismatch when declared differs from ledger', () => {
    const balances = computeBalances(buildAlmaraiLedger());
    const flags = detectReconciliationMismatch(
      [
        {
          supervisor_id: SUPERVISOR_A,
          campaign_id: CAMPAIGN,
          sku_id: SKU_CUPS,
          promoter_ids: [JUBEIHA, CTOWN, COZMO],
          declared_on_hand: 500, // physically counted 500 but ledger says 470
        },
      ],
      balances,
    );
    expect(flags).toHaveLength(1);
    const flag = flags[0];
    if (flag && flag.kind === 'reconciliation_mismatch') {
      expect(flag.expected).toBe(470);
      expect(flag.declared).toBe(500);
      expect(flag.diff).toBe(30);
    } else {
      expect.fail('expected a reconciliation_mismatch flag');
    }
  });
});

// ============================================================================
// readLowStockThreshold / readNoUsageHours — kpi_config helpers
// ============================================================================

describe('kpi_config helpers', () => {
  it('readNoUsageHours falls back to the default for invalid/missing values', () => {
    expect(readNoUsageHours(null)).toBe(DEFAULT_ANOMALY_THRESHOLDS.no_usage_hours);
    expect(readNoUsageHours(undefined)).toBe(DEFAULT_ANOMALY_THRESHOLDS.no_usage_hours);
    expect(readNoUsageHours({})).toBe(DEFAULT_ANOMALY_THRESHOLDS.no_usage_hours);
    expect(readNoUsageHours({ no_usage_hours: 'x' })).toBe(DEFAULT_ANOMALY_THRESHOLDS.no_usage_hours);
    expect(readNoUsageHours({ no_usage_hours: 0 })).toBe(DEFAULT_ANOMALY_THRESHOLDS.no_usage_hours);
    expect(readNoUsageHours({ no_usage_hours: -1 })).toBe(DEFAULT_ANOMALY_THRESHOLDS.no_usage_hours);
    expect(readNoUsageHours({ no_usage_hours: 8 })).toBe(8);
  });

  it('readLowStockThreshold accepts 0 (disabled) but rejects negatives', () => {
    expect(readLowStockThreshold({ low_stock_threshold: 0 })).toBe(0);
    expect(readLowStockThreshold({ low_stock_threshold: -1 })).toBe(
      DEFAULT_ANOMALY_THRESHOLDS.low_stock_threshold,
    );
    expect(readLowStockThreshold({ low_stock_threshold: 20 })).toBe(20);
  });
});

// ============================================================================
// Smoke — entityKey, balanceKey, LEDGER_VERSION
// ============================================================================

describe('key helpers + version', () => {
  it('entityKey collapses NULL id to ~ sentinel', () => {
    expect(entityKey('warehouse', null)).toBe('warehouse:~');
    expect(entityKey('supervisor', 'abc')).toBe('supervisor:abc');
  });

  it('balanceKey composes campaign|sku|entityKey', () => {
    expect(balanceKey('c', 's', 'promoter', 'p')).toBe('c|s|promoter:p');
  });

  it('LEDGER_VERSION is 1', () => {
    expect(LEDGER_VERSION).toBe(1);
  });
});
