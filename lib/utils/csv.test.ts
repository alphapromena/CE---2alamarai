import { describe, it, expect } from 'vitest';
import { csvFilename, rowsToCsv, toCsvWithBom } from './csv';

describe('rowsToCsv', () => {
  it('joins simple rows with CRLF and commas', () => {
    expect(rowsToCsv([['a', 'b'], ['1', '2']])).toBe('a,b\r\n1,2');
  });

  it('quotes cells containing comma, quote, or newline', () => {
    expect(rowsToCsv([['a,b', 'c"d', 'e\nf']])).toBe('"a,b","c""d","e\nf"');
  });

  it('stringifies numbers and booleans, empties null/undefined', () => {
    expect(rowsToCsv([[1, true, null, undefined, 'x']])).toBe('1,true,,,x');
  });

  it('supports a single-column CSV', () => {
    expect(rowsToCsv([['a'], ['b'], ['c']])).toBe('a\r\nb\r\nc');
  });
});

describe('toCsvWithBom', () => {
  it('prepends a UTF-8 BOM', () => {
    const out = toCsvWithBom([['الحضور'], ['موجود']]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out.slice(1)).toBe('الحضور\r\nموجود');
  });
});

describe('csvFilename', () => {
  it('sanitises prefix and embeds an ISO timestamp', () => {
    const name = csvFilename('attendance/live report', new Date('2026-04-20T10:11:12.345Z'));
    expect(name).toBe('attendance-live-report-2026-04-20T10-11-12-345Z.csv');
  });
});
