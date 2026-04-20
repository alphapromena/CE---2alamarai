import { describe, expect, it } from 'vitest';
import { parseCsv } from './parse';

describe('parseCsv', () => {
  it('parses a header + two data rows into trimmed string objects', () => {
    const csv = 'name,age\r\n  Alice ,30\r\nBob,25\r\n';
    const { rows, parseError } = parseCsv(csv);
    expect(parseError).toBeNull();
    expect(rows).toEqual([
      { name: 'Alice', age: '30' },
      { name: 'Bob', age: '25' },
    ]);
  });

  it('strips a leading UTF-8 BOM so header lookups work', () => {
    const csv = '\uFEFFname,age\nAlice,30\n';
    const { rows } = parseCsv(csv);
    expect(rows[0]).toEqual({ name: 'Alice', age: '30' });
    // First key should not contain the BOM character.
    expect(Object.keys(rows[0]!)[0]).toBe('name');
  });

  it('skips fully empty rows', () => {
    const csv = 'a,b\n,\n1,2\n';
    const { rows } = parseCsv(csv);
    expect(rows).toEqual([{ a: '1', b: '2' }]);
  });

  it('preserves quoted commas inside a field', () => {
    const csv = 'name,address\n"Alice","123, Main St"\n';
    const { rows } = parseCsv(csv);
    expect(rows[0]?.address).toBe('123, Main St');
  });

  it('reports a parseError when quoting is malformed', () => {
    const csv = 'a,b\n"unterminated,2\n';
    const { rows, parseError } = parseCsv(csv);
    expect(parseError).not.toBeNull();
    expect(rows).toEqual([]);
  });

  it('returns no rows for headers-only input', () => {
    const { rows, parseError } = parseCsv('a,b,c\n');
    expect(parseError).toBeNull();
    expect(rows).toEqual([]);
  });

  it('coerces non-string cell values from papa to trimmed strings', () => {
    // Papa hands back numeric-looking strings as strings; this guards the
    // String() fallback in case future option changes alter that.
    const csv = 'a,b\n1, two \n';
    const { rows } = parseCsv(csv);
    expect(rows[0]).toEqual({ a: '1', b: 'two' });
  });
});
