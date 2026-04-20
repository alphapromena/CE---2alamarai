import { describe, it, expect } from 'vitest';
import {
  ZERO_VISIBILITY,
  promoterDisplayId,
  scrubPromoterFields,
  type ClientVisibility,
  type PromoterFields,
} from './client-visibility';

const PROMO_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PROMO_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function visibility(overrides: Partial<ClientVisibility> = {}): ClientVisibility {
  return { ...ZERO_VISIBILITY, ...overrides };
}

function rowFor(promoterId: string): PromoterFields {
  return {
    promoter_id: promoterId,
    promoter_name: 'Ahmed',
    promoter_photo_url: 'https://storage/foo.jpg',
    alerts: [{ kind: 'low_performance' }],
  };
}

describe('promoterDisplayId', () => {
  it('produces a stable P + 6 hex id across calls', () => {
    const a = promoterDisplayId(PROMO_A);
    const b = promoterDisplayId(PROMO_A);
    expect(a).toBe(b);
    expect(a).toMatch(/^P[0-9A-F]{6}$/);
  });

  it('produces distinct ids for distinct promoters', () => {
    expect(promoterDisplayId(PROMO_A)).not.toBe(promoterDisplayId(PROMO_B));
  });
});

describe('scrubPromoterFields — all-false (D-019 default)', () => {
  it('clears name, photo, alerts and adds display id', () => {
    const out = scrubPromoterFields(rowFor(PROMO_A), visibility());
    expect(out.promoter_name).toBeNull();
    expect(out.promoter_photo_url).toBeNull();
    expect(out.alerts).toBeUndefined();
    expect(out.promoter_display_id).toMatch(/^P[0-9A-F]{6}$/);
  });

  it('never mutates the input row', () => {
    const input = rowFor(PROMO_A);
    const snapshot = { ...input };
    scrubPromoterFields(input, visibility());
    expect(input).toEqual(snapshot);
  });
});

describe('scrubPromoterFields — single-flag toggles', () => {
  it('show_promoter_names=true keeps the name but still scrubs photos/alerts', () => {
    const out = scrubPromoterFields(rowFor(PROMO_A), visibility({ show_promoter_names: true }));
    expect(out.promoter_name).toBe('Ahmed');
    expect(out.promoter_photo_url).toBeNull();
    expect(out.alerts).toBeUndefined();
  });

  it('show_promoter_photos=true keeps the photo URL but still hides name/alerts', () => {
    const out = scrubPromoterFields(rowFor(PROMO_A), visibility({ show_promoter_photos: true }));
    expect(out.promoter_name).toBeNull();
    expect(out.promoter_photo_url).toBe('https://storage/foo.jpg');
    expect(out.alerts).toBeUndefined();
  });

  it('show_promoter_alerts=true keeps the alerts but still hides name/photo', () => {
    const out = scrubPromoterFields(rowFor(PROMO_A), visibility({ show_promoter_alerts: true }));
    expect(out.promoter_name).toBeNull();
    expect(out.promoter_photo_url).toBeNull();
    expect(out.alerts).toEqual([{ kind: 'low_performance' }]);
  });
});

describe('scrubPromoterFields — all-true', () => {
  it('keeps every field and still attaches the display id', () => {
    const out = scrubPromoterFields(
      rowFor(PROMO_A),
      visibility({
        show_promoter_names: true,
        show_promoter_photos: true,
        show_promoter_alerts: true,
        show_promoter_full_profile: true,
      }),
    );
    expect(out.promoter_name).toBe('Ahmed');
    expect(out.promoter_photo_url).toBe('https://storage/foo.jpg');
    expect(out.alerts).toEqual([{ kind: 'low_performance' }]);
    expect(out.promoter_display_id).toBe(promoterDisplayId(PROMO_A));
  });
});

// ---------------------------------------------------------------------------
// Feature 4 / D-041 — photo scrub must still nullify photo URLs from newly-
// attached attendance selfies when show_promoter_photos=false. Locks in the
// Feature 3 invariant against Feature 4 introducing photo_path references.
// ---------------------------------------------------------------------------
describe('scrubPromoterFields — Feature 4 photo-path regression', () => {
  it('nulls Feature-4 selfie URL when show_promoter_photos=false', () => {
    const input: PromoterFields = {
      promoter_id: PROMO_A,
      promoter_name: 'Ahmed',
      promoter_photo_url: 'https://storage/attendance/uid/2026-04-20/check_in.jpg',
      alerts: undefined,
    };
    const out = scrubPromoterFields(input, visibility());
    expect(out.promoter_photo_url).toBeNull();
  });

  it('keeps Feature-4 selfie URL intact when show_promoter_photos=true', () => {
    const input: PromoterFields = {
      promoter_id: PROMO_A,
      promoter_name: 'Ahmed',
      promoter_photo_url: 'https://storage/attendance/uid/2026-04-20/check_in.jpg',
      alerts: undefined,
    };
    const out = scrubPromoterFields(input, visibility({ show_promoter_photos: true }));
    expect(out.promoter_photo_url).toBe(
      'https://storage/attendance/uid/2026-04-20/check_in.jpg',
    );
  });

  it('handles rows that omit promoter_photo_url entirely (photo not taken)', () => {
    const input: PromoterFields = {
      promoter_id: PROMO_A,
      promoter_name: 'Ahmed',
      alerts: undefined,
    };
    const out = scrubPromoterFields(input, visibility({ show_promoter_photos: true }));
    expect(out.promoter_photo_url).toBeUndefined();
  });
});

describe('ZERO_VISIBILITY', () => {
  it('is frozen and all-false', () => {
    expect(ZERO_VISIBILITY).toEqual({
      show_promoter_names: false,
      show_promoter_photos: false,
      show_promoter_alerts: false,
      show_promoter_full_profile: false,
    });
    expect(Object.isFrozen(ZERO_VISIBILITY)).toBe(true);
  });
});
