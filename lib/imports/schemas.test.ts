import { describe, expect, it } from 'vitest';
import {
  productRowSchema,
  promoterRowSchema,
  locationRowSchema,
  firstIssueMessage,
} from './schemas';

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';
const CITY_ID = '22222222-2222-4222-8222-222222222222';

describe('productRowSchema', () => {
  const valid = {
    campaign_id: CAMPAIGN_ID,
    name_en: 'Almarai Laban 1L',
    name_ar: 'لبن المراعي 1 لتر',
    unit_en: 'bottle',
    unit_ar: 'عبوة',
    target: '500',
    stock_allocated: '1000',
    active: 'true',
  };

  it('accepts a valid row and shapes name_i18n + unit_i18n', () => {
    const out = productRowSchema.safeParse(valid);
    expect(out.success).toBe(true);
    if (out.success) {
      expect(out.data.name_i18n).toEqual({ en: 'Almarai Laban 1L', ar: 'لبن المراعي 1 لتر' });
      expect(out.data.unit_i18n).toEqual({ en: 'bottle', ar: 'عبوة' });
      expect(out.data.target).toBe(500);
      expect(out.data.stock_allocated).toBe(1000);
      expect(out.data.active).toBe(true);
    }
  });

  it('defaults active=true when blank', () => {
    const out = productRowSchema.safeParse({ ...valid, active: '' });
    expect(out.success).toBe(true);
    if (out.success) expect(out.data.active).toBe(true);
  });

  it('rejects non-uuid campaign_id', () => {
    const out = productRowSchema.safeParse({ ...valid, campaign_id: 'not-a-uuid' });
    expect(out.success).toBe(false);
  });

  it('rejects negative target', () => {
    const out = productRowSchema.safeParse({ ...valid, target: '-1' });
    expect(out.success).toBe(false);
  });

  it('rejects non-integer target', () => {
    const out = productRowSchema.safeParse({ ...valid, target: '5.5' });
    expect(out.success).toBe(false);
  });
});

describe('promoterRowSchema', () => {
  const valid = {
    email: 'Promoter@Example.COM',
    full_name: 'Sample Promoter',
    preferred_language: 'en',
    phone: '+966500000000',
  };

  it('accepts a valid row and lowercases the email', () => {
    const out = promoterRowSchema.safeParse(valid);
    expect(out.success).toBe(true);
    if (out.success) {
      expect(out.data.email).toBe('promoter@example.com');
      expect(out.data.preferred_language).toBe('en');
      expect(out.data.phone).toBe('+966500000000');
    }
  });

  it('treats blank preferred_language as en', () => {
    const out = promoterRowSchema.safeParse({ ...valid, preferred_language: '' });
    expect(out.success).toBe(true);
    if (out.success) expect(out.data.preferred_language).toBe('en');
  });

  it('treats blank phone as undefined', () => {
    const out = promoterRowSchema.safeParse({ ...valid, phone: '' });
    expect(out.success).toBe(true);
    if (out.success) expect(out.data.phone).toBeUndefined();
  });

  it('rejects an invalid email', () => {
    const out = promoterRowSchema.safeParse({ ...valid, email: 'not-an-email' });
    expect(out.success).toBe(false);
  });

  it('rejects an unknown preferred_language', () => {
    const out = promoterRowSchema.safeParse({ ...valid, preferred_language: 'fr' });
    expect(out.success).toBe(false);
  });
});

describe('locationRowSchema', () => {
  const valid = {
    city_id: CITY_ID,
    name_en: 'Sample Hypermarket',
    name_ar: 'هايبر ماركت',
    address: '123 King Fahd Rd',
    lat: '24.7136',
    lng: '46.6753',
    geofence_radius_m: '100',
  };

  it('accepts a valid row and shapes name_i18n', () => {
    const out = locationRowSchema.safeParse(valid);
    expect(out.success).toBe(true);
    if (out.success) {
      expect(out.data.name_i18n).toEqual({ en: 'Sample Hypermarket', ar: 'هايبر ماركت' });
      expect(out.data.lat).toBeCloseTo(24.7136);
      expect(out.data.lng).toBeCloseTo(46.6753);
      expect(out.data.geofence_radius_m).toBe(100);
      expect(out.data.address).toBe('123 King Fahd Rd');
    }
  });

  it('treats blank address as undefined', () => {
    const out = locationRowSchema.safeParse({ ...valid, address: '' });
    expect(out.success).toBe(true);
    if (out.success) expect(out.data.address).toBeUndefined();
  });

  it('rejects lat outside [-90, 90]', () => {
    const out = locationRowSchema.safeParse({ ...valid, lat: '95' });
    expect(out.success).toBe(false);
  });

  it('rejects geofence below the minimum', () => {
    const out = locationRowSchema.safeParse({ ...valid, geofence_radius_m: '5' });
    expect(out.success).toBe(false);
  });

  it('rejects non-uuid city_id', () => {
    const out = locationRowSchema.safeParse({ ...valid, city_id: 'nope' });
    expect(out.success).toBe(false);
  });
});

describe('firstIssueMessage', () => {
  it('returns "field: message" for the first issue', () => {
    const out = locationRowSchema.safeParse({
      city_id: 'nope',
      name_en: 'X',
      name_ar: 'س',
      address: '',
      lat: '0',
      lng: '0',
      geofence_radius_m: '100',
    });
    expect(out.success).toBe(false);
    if (!out.success) {
      const msg = firstIssueMessage(out.error);
      expect(msg.startsWith('city_id:')).toBe(true);
    }
  });
});
