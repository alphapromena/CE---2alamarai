/**
 * CSV serializer — RFC 4180 with a BOM for Excel compatibility.
 *
 * No runtime dependencies. Caller composes rows as string[][] (header first),
 * we quote any field containing comma/quote/newline. Undefined / null become
 * empty strings. Numbers / booleans stringified.
 */

type CsvCell = string | number | boolean | null | undefined;

function quote(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'string' ? value : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowsToCsv(rows: readonly (readonly CsvCell[])[]): string {
  return rows.map((row) => row.map(quote).join(',')).join('\r\n');
}

/**
 * Full CSV body with BOM so Excel opens as UTF-8 (Arabic strings don't
 * mojibake). Pair with Content-Type: text/csv; charset=utf-8.
 */
export function toCsvWithBom(rows: readonly (readonly CsvCell[])[]): string {
  return `\uFEFF${rowsToCsv(rows)}`;
}

/**
 * Build a safe filename — alphanumerics + dashes, plus a timestamp.
 */
export function csvFilename(prefix: string, date: Date = new Date()): string {
  const safe = prefix.replace(/[^a-zA-Z0-9_-]/g, '-');
  const iso = date.toISOString().replace(/[:.]/g, '-');
  return `${safe}-${iso}.csv`;
}
