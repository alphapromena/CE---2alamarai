/**
 * Compose an export artifact (XLSX or CSV-zip) from a fully-populated
 * ExportInput. Pure — no I/O. Returns bytes + suggested filename + MIME.
 */

import { buildAllSheets } from './builders.ts';
import { buildXlsx } from './xlsx.ts';
import { buildZip, type ZipEntry } from './zip.ts';
import { toCsvWithBom } from './csv.ts';
import type { ExportFormat, ExportInput, Sheet } from './exports-types.ts';

export type ComposedArtifact = {
  bytes: Uint8Array;
  filename: string;
  mime: string;
};

function slugifySheetName(name: string, idx: number): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s.length > 0 ? s : `sheet-${idx + 1}`;
}

function composeCsvZip(sheets: readonly Sheet[]): Uint8Array {
  const encoder = new TextEncoder();
  const seen = new Set<string>();
  const entries: ZipEntry[] = sheets.map((s, i) => {
    let base = slugifySheetName(s.name, i);
    let candidate = `${base}.csv`;
    let suffix = 2;
    while (seen.has(candidate)) {
      candidate = `${base}-${suffix}.csv`;
      suffix += 1;
    }
    seen.add(candidate);
    const rows: (string | number | null | undefined)[][] = [
      [...s.columns],
      ...s.rows.map((r) => [...r]),
    ];
    const csv = toCsvWithBom(rows);
    return { path: candidate, data: encoder.encode(csv) };
  });
  return buildZip(entries);
}

function timestampSuffix(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

export function composeExport(
  input: ExportInput,
  format: ExportFormat,
  options: { prefix?: string; now?: Date } = {},
): ComposedArtifact {
  const sheets = buildAllSheets(input);
  const prefix = (options.prefix ?? 'export').replace(/[^a-zA-Z0-9_-]/g, '-');
  const ts = timestampSuffix(options.now ?? new Date());
  if (sheets.length === 0) {
    // Emit a 1-sheet "empty" artifact so the user doesn't get a 0-byte file.
    const empty: Sheet = { name: 'Empty', columns: ['message'], rows: [['No data matched this scope.']] };
    if (format === 'xlsx') {
      return {
        bytes: buildXlsx([empty]),
        filename: `${prefix}-${ts}.xlsx`,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }
    return {
      bytes: composeCsvZip([empty]),
      filename: `${prefix}-${ts}.zip`,
      mime: 'application/zip',
    };
  }
  if (format === 'xlsx') {
    return {
      bytes: buildXlsx(sheets),
      filename: `${prefix}-${ts}.xlsx`,
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }
  return {
    bytes: composeCsvZip(sheets),
    filename: `${prefix}-${ts}.zip`,
    mime: 'application/zip',
  };
}
