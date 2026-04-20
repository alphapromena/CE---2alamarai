import { describe, expect, it } from 'vitest';
import { buildXlsx, colLetters, sanitizeSheetName, xmlEscape } from './xlsx';
import type { Sheet } from './types';

const decoder = new TextDecoder();

function zipHasEntry(bytes: Uint8Array, path: string): boolean {
  // Minimal scan: find a local file header (PK\x03\x04) whose filename
  // field equals `path`.
  const enc = new TextEncoder().encode(path);
  outer: for (let i = 0; i <= bytes.length - 30 - enc.length; i++) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x03 &&
      bytes[i + 3] === 0x04
    ) {
      const nameLen = (bytes[i + 26] ?? 0) | ((bytes[i + 27] ?? 0) << 8);
      if (nameLen !== enc.length) continue;
      for (let j = 0; j < nameLen; j++) {
        if (bytes[i + 30 + j] !== enc[j]) continue outer;
      }
      return true;
    }
  }
  return false;
}

function extractEntry(bytes: Uint8Array, path: string): Uint8Array | null {
  const enc = new TextEncoder().encode(path);
  outer: for (let i = 0; i <= bytes.length - 30 - enc.length; i++) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x03 &&
      bytes[i + 3] === 0x04
    ) {
      const nameLen = (bytes[i + 26] ?? 0) | ((bytes[i + 27] ?? 0) << 8);
      if (nameLen !== enc.length) continue;
      for (let j = 0; j < nameLen; j++) {
        if (bytes[i + 30 + j] !== enc[j]) continue outer;
      }
      const compSize =
        ((bytes[i + 18] ?? 0) |
          ((bytes[i + 19] ?? 0) << 8) |
          ((bytes[i + 20] ?? 0) << 16) |
          ((bytes[i + 21] ?? 0) << 24)) >>>
        0;
      const start = i + 30 + nameLen;
      return bytes.slice(start, start + compSize);
    }
  }
  return null;
}

describe('xmlEscape', () => {
  it('escapes the five predefined entities', () => {
    expect(xmlEscape(`<a href="u" & 'v'>`)).toBe('&lt;a href=&quot;u&quot; &amp; &apos;v&apos;&gt;');
  });

  it('preserves Arabic characters intact', () => {
    expect(xmlEscape('المبيعات')).toBe('المبيعات');
  });

  it('strips illegal XML control characters', () => {
    const s = 'a\x00b\x08c\x1fd';
    expect(xmlEscape(s)).toBe('abcd');
  });

  it('keeps tab, newline, and carriage return', () => {
    expect(xmlEscape('a\tb\nc\rd')).toBe('a\tb\nc\rd');
  });
});

describe('colLetters', () => {
  it('produces Excel column letters', () => {
    expect(colLetters(1)).toBe('A');
    expect(colLetters(26)).toBe('Z');
    expect(colLetters(27)).toBe('AA');
    expect(colLetters(52)).toBe('AZ');
    expect(colLetters(53)).toBe('BA');
    expect(colLetters(702)).toBe('ZZ');
    expect(colLetters(703)).toBe('AAA');
  });

  it('throws on non-positive input', () => {
    expect(() => colLetters(0)).toThrow();
    expect(() => colLetters(-1)).toThrow();
  });
});

describe('sanitizeSheetName', () => {
  it('replaces forbidden chars', () => {
    expect(sanitizeSheetName('a/b\\c:d*e?f[g]h', 'x')).toBe('a_b_c_d_e_f_g_h');
  });

  it('truncates to 31 chars', () => {
    expect(sanitizeSheetName('x'.repeat(50), 'fallback').length).toBe(31);
  });

  it('falls back when empty after cleaning', () => {
    expect(sanitizeSheetName('', 'F')).toBe('F');
    expect(sanitizeSheetName('   ', 'F')).toBe('F');
  });
});

describe('buildXlsx', () => {
  const sampleSheet: Sheet = {
    name: 'Attendance',
    columns: ['Date', 'Promoter', 'Late (min)'],
    rows: [
      ['2026-04-20', 'Ahmed', 5],
      ['2026-04-20', 'Sara', null],
    ],
  };

  it('throws with zero sheets', () => {
    expect(() => buildXlsx([])).toThrow();
  });

  it('emits required parts', () => {
    const bytes = buildXlsx([sampleSheet]);
    expect(zipHasEntry(bytes, '[Content_Types].xml')).toBe(true);
    expect(zipHasEntry(bytes, '_rels/.rels')).toBe(true);
    expect(zipHasEntry(bytes, 'xl/workbook.xml')).toBe(true);
    expect(zipHasEntry(bytes, 'xl/_rels/workbook.xml.rels')).toBe(true);
    expect(zipHasEntry(bytes, 'xl/worksheets/sheet1.xml')).toBe(true);
  });

  it('encodes header + numeric + string + null cells correctly', () => {
    const bytes = buildXlsx([sampleSheet]);
    const sheetXml = extractEntry(bytes, 'xl/worksheets/sheet1.xml');
    expect(sheetXml).not.toBeNull();
    if (!sheetXml) return;
    const s = decoder.decode(sheetXml);
    expect(s).toContain('<c r="A1" t="inlineStr"><is><t xml:space="preserve">Date</t></is></c>');
    expect(s).toContain('<c r="B2" t="inlineStr"><is><t xml:space="preserve">Ahmed</t></is></c>');
    expect(s).toContain('<c r="C2"><v>5</v></c>');
    expect(s).toContain('<c r="C3"/>'); // null becomes empty
  });

  it('deduplicates colliding sheet names', () => {
    const a: Sheet = { name: 'Report', columns: ['x'], rows: [[1]] };
    const b: Sheet = { name: 'Report', columns: ['x'], rows: [[2]] };
    const bytes = buildXlsx([a, b]);
    const wb = extractEntry(bytes, 'xl/workbook.xml');
    expect(wb).not.toBeNull();
    if (!wb) return;
    const s = decoder.decode(wb);
    expect(s).toContain('name="Report"');
    expect(s).toContain('name="Report_2"');
  });

  it('preserves Arabic content', () => {
    const bytes = buildXlsx([
      {
        name: 'تقرير',
        columns: ['الاسم', 'القيمة'],
        rows: [['أحمد', 7]],
      },
    ]);
    const sheet = extractEntry(bytes, 'xl/worksheets/sheet1.xml');
    expect(sheet).not.toBeNull();
    if (!sheet) return;
    const s = decoder.decode(sheet);
    expect(s).toContain('الاسم');
    expect(s).toContain('أحمد');
  });

  it('is deterministic for identical input', () => {
    const a = buildXlsx([sampleSheet]);
    const b = buildXlsx([sampleSheet]);
    expect(a).toEqual(b);
  });
});
