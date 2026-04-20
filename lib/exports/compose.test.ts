import { describe, expect, it } from 'vitest';
import { composeExport } from './compose';
import type { ExportInput } from './types';

const fixedNow = new Date('2026-04-20T10:00:00.000Z');

const minimal: ExportInput = {
  role: 'admin',
  locale: 'en',
  scope: {
    campaign_ids: [],
    location_ids: [],
    sku_ids: [],
    from_date: '2026-04-18',
    to_date: '2026-04-20',
    domains: ['feedback'],
  },
  feedback: [
    {
      id: 'f1',
      created_at: '2026-04-18T10:00:00.000Z',
      campaign_id: 'c1',
      campaign_name: { en: 'Almarai' },
      location_id: 'l1',
      location_name: { en: 'Jubeiha' },
      promoter_user_id: 'p1',
      promoter_name: 'Ahmed',
      category: 'product',
      sentiment: 'positive',
      body: 'Tasty',
      competitor_brands: [],
    },
  ],
};

describe('composeExport', () => {
  it('produces an XLSX artifact with the expected filename + mime', () => {
    const out = composeExport(minimal, 'xlsx', { prefix: 'almarai', now: fixedNow });
    expect(out.filename).toBe('almarai-2026-04-20T10-00-00-000Z.xlsx');
    expect(out.mime).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(out.bytes.length).toBeGreaterThan(200);
    // Zip magic
    expect(out.bytes[0]).toBe(0x50);
    expect(out.bytes[1]).toBe(0x4b);
  });

  it('produces a CSV-zip artifact', () => {
    const out = composeExport(minimal, 'csv_zip', { prefix: 'almarai', now: fixedNow });
    expect(out.filename).toBe('almarai-2026-04-20T10-00-00-000Z.zip');
    expect(out.mime).toBe('application/zip');
    expect(out.bytes[0]).toBe(0x50);
    expect(out.bytes[1]).toBe(0x4b);
  });

  it('emits an "Empty" sheet when no data matches', () => {
    const empty: ExportInput = { ...minimal, feedback: [] };
    const out = composeExport(empty, 'xlsx', { prefix: 'x', now: fixedNow });
    // Find a cell containing "No data matched"
    const decoded = new TextDecoder().decode(out.bytes);
    expect(decoded).toContain('No data matched this scope.');
  });

  it('sanitizes the prefix for the filename', () => {
    const out = composeExport(minimal, 'xlsx', { prefix: 'weird/path name', now: fixedNow });
    expect(out.filename).toMatch(/^weird-path-name-/);
  });
});
