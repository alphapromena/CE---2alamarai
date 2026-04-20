/**
 * Minimal STORED-only ZIP writer.
 *
 * No compression — files are stored as-is. This is the simplest ZIP layout
 * (PKZIP APPNOTE section 4.3) that Excel, LibreOffice, and unzip happily
 * accept. Both CSV-zip exports and XLSX packages share this writer.
 *
 * Why not JSZip / fflate: keeping zero new deps per D-032. The writer is
 * ~90 lines and fully tested.
 *
 * Spec-conformance notes:
 *   - Version needed to extract: 2.0 (stored + pre-Zip64)
 *   - No general-purpose bit 11 (UTF-8); filenames use plain UTF-8 bytes
 *     and rely on consumer leniency. All Phase 8 filenames are ASCII
 *     (`attendance.csv`, `xl/worksheets/sheet1.xml`, etc.) so this is safe.
 *   - CRC32 computed per file.
 *   - MS-DOS date/time frozen to 1980-01-01 00:00:00 for deterministic
 *     output — export artifacts are timestamped in the filename instead.
 */

export type ZipEntry = {
  /** forward-slash separated, no leading slash */
  path: string;
  data: Uint8Array;
};

// ---------------------------------------------------------------------------
// CRC32 (IEEE polynomial)
// ---------------------------------------------------------------------------
const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n >>> 0;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] ?? 0;
    c = (c >>> 8) ^ (CRC_TABLE[(c ^ b) & 0xff] ?? 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// Little-endian writers
// ---------------------------------------------------------------------------
function writeU16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value & 0xffff, true);
}
function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

const DOS_EPOCH_DATE = 0x21; // (1980 - 1980) << 9 | 1 << 5 | 1
const DOS_EPOCH_TIME = 0x0000;

/**
 * Build a ZIP archive from the given entries and return the full byte
 * stream. Deterministic for identical input.
 */
export function buildZip(entries: ReadonlyArray<ZipEntry>): Uint8Array {
  const encoder = new TextEncoder();

  type Prepared = {
    nameBytes: Uint8Array;
    data: Uint8Array;
    crc: number;
    localHeaderOffset: number;
  };

  // First pass — compute sizes to allocate the output buffer.
  let localPartSize = 0;
  let centralPartSize = 0;
  const prepped: Prepared[] = [];
  for (const e of entries) {
    const nameBytes = encoder.encode(e.path);
    const crc = crc32(e.data);
    prepped.push({ nameBytes, data: e.data, crc, localHeaderOffset: localPartSize });
    localPartSize += 30 + nameBytes.length + e.data.length;
    centralPartSize += 46 + nameBytes.length;
  }
  const eocdSize = 22;
  const total = localPartSize + centralPartSize + eocdSize;

  const buf = new Uint8Array(total);
  const view = new DataView(buf.buffer);

  // Second pass — write local file headers + data.
  let off = 0;
  for (const p of prepped) {
    p.localHeaderOffset = off;
    writeU32(view, off, 0x04034b50); // local file header signature
    writeU16(view, off + 4, 20); // version needed
    writeU16(view, off + 6, 0); // general purpose flags
    writeU16(view, off + 8, 0); // compression method = STORED
    writeU16(view, off + 10, DOS_EPOCH_TIME);
    writeU16(view, off + 12, DOS_EPOCH_DATE);
    writeU32(view, off + 14, p.crc);
    writeU32(view, off + 18, p.data.length); // compressed size
    writeU32(view, off + 22, p.data.length); // uncompressed size
    writeU16(view, off + 26, p.nameBytes.length);
    writeU16(view, off + 28, 0); // extra field length
    off += 30;
    buf.set(p.nameBytes, off);
    off += p.nameBytes.length;
    buf.set(p.data, off);
    off += p.data.length;
  }

  // Third pass — central directory.
  const cdStart = off;
  for (const p of prepped) {
    writeU32(view, off, 0x02014b50); // central directory signature
    writeU16(view, off + 4, 20); // version made by
    writeU16(view, off + 6, 20); // version needed
    writeU16(view, off + 8, 0); // flags
    writeU16(view, off + 10, 0); // method
    writeU16(view, off + 12, DOS_EPOCH_TIME);
    writeU16(view, off + 14, DOS_EPOCH_DATE);
    writeU32(view, off + 16, p.crc);
    writeU32(view, off + 20, p.data.length);
    writeU32(view, off + 24, p.data.length);
    writeU16(view, off + 28, p.nameBytes.length);
    writeU16(view, off + 30, 0); // extra
    writeU16(view, off + 32, 0); // comment
    writeU16(view, off + 34, 0); // disk number
    writeU16(view, off + 36, 0); // internal attrs
    writeU32(view, off + 38, 0); // external attrs
    writeU32(view, off + 42, p.localHeaderOffset);
    off += 46;
    buf.set(p.nameBytes, off);
    off += p.nameBytes.length;
  }
  const cdSize = off - cdStart;

  // End of central directory record.
  writeU32(view, off, 0x06054b50);
  writeU16(view, off + 4, 0); // disk number
  writeU16(view, off + 6, 0); // cd start disk
  writeU16(view, off + 8, prepped.length);
  writeU16(view, off + 10, prepped.length);
  writeU32(view, off + 12, cdSize);
  writeU32(view, off + 16, cdStart);
  writeU16(view, off + 20, 0); // comment length

  return buf;
}
