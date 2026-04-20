import Papa from 'papaparse';

export type ParsedRow = Record<string, string>;

export interface ParseResult {
  rows: ParsedRow[];
  parseError: string | null;
}

/**
 * Parse a CSV string into trimmed string-valued rows. The wrapper exists so
 * callers can stay agnostic of papaparse's option surface and so that the
 * server action surfaces a single boolean for "did parsing fail catastrophically?".
 *
 * - `header: true` so callers index by column name.
 * - `skipEmptyLines: true` so trailing blank lines don't appear as failed rows.
 * - All cell values are trimmed; empty strings become empty strings (zod
 *   validators decide whether that's acceptable per-target).
 * - Papa's per-row errors (malformed quoting etc.) are aggregated into the
 *   summary error message — we do not try to recover individual rows.
 */
export function parseCsv(input: string): ParseResult {
  // Strip a leading UTF-8 BOM. Papa handles BOM internally on a stream, but
  // when we hand it a String it occasionally leaves the marker on the first
  // header — which then breaks header lookups by name.
  const cleaned = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  const result = Papa.parse<Record<string, unknown>>(cleaned, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (result.errors.length > 0) {
    const firstFatal = result.errors.find((e) => e.type === 'Quotes' || e.type === 'Delimiter');
    if (firstFatal) {
      return { rows: [], parseError: firstFatal.message };
    }
  }

  const rows: ParsedRow[] = [];
  for (const raw of result.data) {
    if (!raw || typeof raw !== 'object') continue;
    const normalised: ParsedRow = {};
    for (const [k, v] of Object.entries(raw)) {
      normalised[k] = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
    }
    // Skip rows where every cell is empty (Papa may emit one if the file ends
    // on a comma-only line that skipEmptyLines didn't catch).
    if (Object.values(normalised).every((v) => v === '')) continue;
    rows.push(normalised);
  }

  return { rows, parseError: null };
}
