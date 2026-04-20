import { describe, expect, it } from 'vitest';
import { buildZip, crc32 } from './zip';

const encoder = new TextEncoder();

function readU16LE(buf: Uint8Array, off: number): number {
  return (buf[off] ?? 0) | ((buf[off + 1] ?? 0) << 8);
}
function readU32LE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] ?? 0) |
      ((buf[off + 1] ?? 0) << 8) |
      ((buf[off + 2] ?? 0) << 16) |
      ((buf[off + 3] ?? 0) << 24)) >>>
    0
  );
}

describe('crc32', () => {
  it('matches known vector for the empty string', () => {
    expect(crc32(encoder.encode(''))).toBe(0);
  });

  it('matches known vector for "123456789"', () => {
    // CRC32 of ASCII "123456789" is 0xCBF43926.
    expect(crc32(encoder.encode('123456789'))).toBe(0xcbf43926);
  });
});

describe('buildZip', () => {
  it('produces a valid stored-zip with one entry', () => {
    const data = encoder.encode('hello, world');
    const zip = buildZip([{ path: 'hello.txt', data }]);

    // Local file header signature
    expect(readU32LE(zip, 0)).toBe(0x04034b50);
    // Compression method (STORED)
    expect(readU16LE(zip, 8)).toBe(0);
    // Uncompressed size
    expect(readU32LE(zip, 22)).toBe(data.length);
    // File name length
    expect(readU16LE(zip, 26)).toBe('hello.txt'.length);

    // Filename appears at offset 30
    const nameBytes = zip.slice(30, 30 + 'hello.txt'.length);
    expect(new TextDecoder().decode(nameBytes)).toBe('hello.txt');

    // Data appears directly after filename
    const dataStart = 30 + 'hello.txt'.length;
    const dataSlice = zip.slice(dataStart, dataStart + data.length);
    expect(new TextDecoder().decode(dataSlice)).toBe('hello, world');

    // EOCD signature near the end
    const eocdOff = zip.length - 22;
    expect(readU32LE(zip, eocdOff)).toBe(0x06054b50);
    // Total entries = 1
    expect(readU16LE(zip, eocdOff + 10)).toBe(1);
  });

  it('handles multiple entries with central directory entries', () => {
    const zip = buildZip([
      { path: 'a.txt', data: encoder.encode('aaa') },
      { path: 'dir/b.txt', data: encoder.encode('bbb') },
      { path: 'c.txt', data: encoder.encode('') },
    ]);
    const eocdOff = zip.length - 22;
    expect(readU32LE(zip, eocdOff)).toBe(0x06054b50);
    expect(readU16LE(zip, eocdOff + 10)).toBe(3);

    // Scan for all local file header signatures — must find exactly 3
    let hits = 0;
    for (let i = 0; i <= zip.length - 4; i++) {
      if (readU32LE(zip, i) === 0x04034b50) hits += 1;
    }
    expect(hits).toBe(3);
  });

  it('preserves UTF-8 filenames (ASCII in Phase 8)', () => {
    const zip = buildZip([{ path: 'xl/worksheets/sheet1.xml', data: encoder.encode('<x/>') }]);
    const nameLen = readU16LE(zip, 26);
    const name = new TextDecoder().decode(zip.slice(30, 30 + nameLen));
    expect(name).toBe('xl/worksheets/sheet1.xml');
  });

  it('is deterministic for identical input', () => {
    const a = buildZip([{ path: 'x.txt', data: encoder.encode('x') }]);
    const b = buildZip([{ path: 'x.txt', data: encoder.encode('x') }]);
    expect(a).toEqual(b);
  });
});
