/**
 * Minimal XLSX (Office Open XML) workbook writer.
 *
 * Emits a STORED-zip package with:
 *   - [Content_Types].xml
 *   - _rels/.rels
 *   - xl/workbook.xml
 *   - xl/_rels/workbook.xml.rels
 *   - xl/worksheets/sheet{1..N}.xml
 *
 * Cell encoding:
 *   - numbers → <c r="A1"><v>123</v></c>
 *   - strings → <c r="A1" t="inlineStr"><is><t xml:space="preserve">…</t></is></c>
 *   - null / undefined → emitted as empty <c r="A1"/> placeholder
 *
 * Inline strings (not sharedStrings) keep the writer ~140 lines. Excel,
 * LibreOffice, and Numbers all accept them. D-032 rationale: zero new deps.
 *
 * UTF-8 throughout — Arabic strings render correctly without a BOM inside
 * the XML parts (OOXML is declared UTF-8 via the prolog).
 */

import { buildZip, type ZipEntry } from './zip';
import type { Sheet } from './types';

// ---------------------------------------------------------------------------
// XML utilities
// ---------------------------------------------------------------------------
const XML_PROLOG = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/**
 * Escape the five XML predefined entities. Also strips control characters
 * disallowed by XML 1.0 (0x00–0x08, 0x0B, 0x0C, 0x0E–0x1F) — they can
 * sneak in from copy-pasted or mobile-keyboard input and break Excel.
 */
export function xmlEscape(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const ch = value.charCodeAt(i);
    if (ch < 0x20 && ch !== 0x09 && ch !== 0x0a && ch !== 0x0d) continue;
    const c = value[i] ?? '';
    if (c === '&') out += '&amp;';
    else if (c === '<') out += '&lt;';
    else if (c === '>') out += '&gt;';
    else if (c === '"') out += '&quot;';
    else if (c === "'") out += '&apos;';
    else out += c;
  }
  return out;
}

/**
 * Convert 1-based column index to Excel letters (A, B, ..., Z, AA, AB, ...).
 */
export function colLetters(col: number): string {
  if (col < 1) throw new Error(`colLetters: col must be ≥ 1 (got ${col})`);
  let n = col;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sheet name sanitization (Excel: ≤ 31 chars, no :\\/?*[])
// ---------------------------------------------------------------------------
const BAD_SHEET_CHARS = /[\\/:*?[\]]/g;

export function sanitizeSheetName(name: string, fallback: string): string {
  const cleaned = name.replace(BAD_SHEET_CHARS, '_').trim();
  const base = cleaned.length > 0 ? cleaned : fallback;
  return base.slice(0, 31);
}

// ---------------------------------------------------------------------------
// Per-sheet XML
// ---------------------------------------------------------------------------
function cellXml(ref: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return `<c r="${ref}"/>`;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return `<c r="${ref}"/>`;
    }
    return `<c r="${ref}"><v>${value}</v></c>`;
  }
  const esc = xmlEscape(String(value));
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc}</t></is></c>`;
}

function sheetXml(sheet: Sheet): string {
  const rows: string[] = [];
  // Header row
  const header = sheet.columns.map((h, idx) => cellXml(`${colLetters(idx + 1)}1`, h)).join('');
  rows.push(`<row r="1">${header}</row>`);
  // Data rows
  for (let r = 0; r < sheet.rows.length; r++) {
    const row = sheet.rows[r];
    if (!row) continue;
    const cells: string[] = [];
    for (let c = 0; c < row.length; c++) {
      cells.push(cellXml(`${colLetters(c + 1)}${r + 2}`, row[c]));
    }
    rows.push(`<row r="${r + 2}">${cells.join('')}</row>`);
  }
  return (
    XML_PROLOG +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${rows.join('')}</sheetData>` +
    '</worksheet>'
  );
}

function workbookXml(names: readonly string[]): string {
  const sheetNodes = names
    .map((n, i) => `<sheet name="${xmlEscape(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('');
  return (
    XML_PROLOG +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets>${sheetNodes}</sheets>` +
    '</workbook>'
  );
}

function workbookRels(count: number): string {
  const rels: string[] = [];
  for (let i = 0; i < count; i++) {
    rels.push(
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    );
  }
  return (
    XML_PROLOG +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    rels.join('') +
    '</Relationships>'
  );
}

function rootRels(): string {
  return (
    XML_PROLOG +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>'
  );
}

function contentTypes(count: number): string {
  const overrides: string[] = [];
  overrides.push(
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
  );
  for (let i = 0; i < count; i++) {
    overrides.push(
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    );
  }
  return (
    XML_PROLOG +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    overrides.join('') +
    '</Types>'
  );
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------
export function buildXlsx(sheets: readonly Sheet[]): Uint8Array {
  if (sheets.length === 0) {
    throw new Error('buildXlsx: at least one sheet is required');
  }
  const encoder = new TextEncoder();
  const seen = new Set<string>();
  const names = sheets.map((s, idx) => {
    const base = sanitizeSheetName(s.name, `Sheet${idx + 1}`);
    let candidate = base;
    let suffix = 2;
    while (seen.has(candidate.toLowerCase())) {
      const suffixStr = `_${suffix}`;
      candidate = sanitizeSheetName(base.slice(0, 31 - suffixStr.length) + suffixStr, `Sheet${idx + 1}`);
      suffix += 1;
    }
    seen.add(candidate.toLowerCase());
    return candidate;
  });

  const entries: ZipEntry[] = [
    { path: '[Content_Types].xml', data: encoder.encode(contentTypes(sheets.length)) },
    { path: '_rels/.rels', data: encoder.encode(rootRels()) },
    { path: 'xl/workbook.xml', data: encoder.encode(workbookXml(names)) },
    { path: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRels(sheets.length)) },
  ];
  for (let i = 0; i < sheets.length; i++) {
    const s = sheets[i];
    if (!s) continue;
    entries.push({
      path: `xl/worksheets/sheet${i + 1}.xml`,
      data: encoder.encode(sheetXml(s)),
    });
  }
  return buildZip(entries);
}
