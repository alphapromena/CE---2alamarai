// JPEG EXIF: parse minimal + strip all metadata.
//
// Phase 3 accepts image/jpeg only for check-in photos. Mobile cameras default
// to JPEG. PNG/WebP handling can be added in Phase 4 if needed; that would
// need a separate code path because their metadata containers are different.
//
// Strategy for stripping:
//   - JPEG is a sequence of markers: 0xFF{marker}[length][data].
//   - Metadata lives in APPn markers (0xFFE0..0xFFEF). EXIF is APP1 with an
//     "Exif\0\0" identifier.
//   - We copy SOI + all non-APPn segments + image data + EOI into a new
//     buffer. The pixel bytes themselves are untouched — no re-encoding, no
//     quality loss.
//
// Strategy for parsing:
//   - Walk the APP1 (EXIF) segment only.
//   - Read TIFF header (big- or little-endian).
//   - Walk the 0th IFD; pull DateTimeOriginal (0x9003) from the Exif sub-IFD
//     (0x8769), and GPS tags (lat/lon + refs) from the GPS IFD (0x8825).
//   - Keep it hand-rolled so we don't pull a 100KB npm dep into the cold-start
//     path. If this becomes brittle, swap for `exifr` (npm:exifr) in one place.

export type ExifMinimal = {
  DateTimeOriginal?: string;
  GPSLatitude?: number;
  GPSLongitude?: number;
};

const SOI = 0xffd8;
const EOI = 0xffd9;
const SOS = 0xffda;
const APP1 = 0xffe1;

export class JpegParseError extends Error {}

function readU16BE(buf: Uint8Array, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}

export function isJpeg(buf: Uint8Array): boolean {
  return buf.length >= 2 && readU16BE(buf, 0) === SOI;
}

/**
 * Strip all APPn markers from a JPEG, returning a new buffer with no EXIF,
 * no ICC profile, no XMP, and no maker notes. Pixel data is copied byte-
 * identical; there is no re-encoding.
 */
export function stripJpegMetadata(input: Uint8Array): Uint8Array {
  if (!isJpeg(input)) {
    throw new JpegParseError('Not a JPEG (missing SOI)');
  }

  const out: number[] = [];
  // Push SOI.
  out.push(0xff, 0xd8);

  let i = 2;
  while (i < input.length) {
    // Skip stuffing / padding FF bytes.
    if (input[i] !== 0xff) {
      throw new JpegParseError(`Expected marker at offset ${i}, got ${input[i]}`);
    }
    let marker = input[i + 1];
    // Some streams pad with 0xFF between segments.
    while (marker === 0xff && i + 2 < input.length) {
      i += 1;
      marker = input[i + 1];
    }
    const markerCode = (0xff << 8) | marker;

    if (markerCode === SOS) {
      // Start of scan: copy the rest of the file verbatim (image data + EOI).
      for (let k = i; k < input.length; k++) out.push(input[k]);
      break;
    }
    if (markerCode === EOI) {
      out.push(0xff, 0xd9);
      i += 2;
      break;
    }

    // Markers without payloads (RSTn, TEM) — not expected in a file stream,
    // but handle defensively.
    if (marker >= 0xd0 && marker <= 0xd7) {
      out.push(0xff, marker);
      i += 2;
      continue;
    }

    // All other markers have a 2-byte length (inclusive of the 2 length bytes).
    if (i + 4 > input.length) {
      throw new JpegParseError(`Truncated segment at offset ${i}`);
    }
    const segLen = readU16BE(input, i + 2);
    const segEnd = i + 2 + segLen;
    if (segEnd > input.length) {
      throw new JpegParseError(`Segment length overflow at offset ${i}`);
    }

    // Drop APPn (0xFFE0..0xFFEF) and COM (0xFFFE) — these carry metadata.
    const isAppN = marker >= 0xe0 && marker <= 0xef;
    const isComment = marker === 0xfe;

    if (!isAppN && !isComment) {
      for (let k = i; k < segEnd; k++) out.push(input[k]);
    }

    i = segEnd;
  }

  return new Uint8Array(out);
}

/**
 * Read DateTimeOriginal + GPS lat/lon from a JPEG's first APP1 (EXIF) segment.
 * Returns an empty object if EXIF is absent or unreadable — parsing is best-
 * effort; a missing value is never fatal.
 */
export function parseJpegExifMinimal(input: Uint8Array): ExifMinimal {
  try {
    return parseJpegExifMinimalUnsafe(input);
  } catch {
    return {};
  }
}

function parseJpegExifMinimalUnsafe(input: Uint8Array): ExifMinimal {
  if (!isJpeg(input)) return {};
  let i = 2;
  while (i < input.length) {
    if (input[i] !== 0xff) return {};
    const marker = input[i + 1];
    if (marker === 0xda || marker === 0xd9) return {}; // SOS or EOI
    const segLen = readU16BE(input, i + 2);
    const segStart = i + 4;
    const segEnd = i + 2 + segLen;

    if (marker === 0xe1) {
      // APP1 — check for "Exif\0\0" identifier.
      if (
        segEnd - segStart >= 6 &&
        input[segStart] === 0x45 && // 'E'
        input[segStart + 1] === 0x78 && // 'x'
        input[segStart + 2] === 0x69 && // 'i'
        input[segStart + 3] === 0x66 && // 'f'
        input[segStart + 4] === 0x00 &&
        input[segStart + 5] === 0x00
      ) {
        return parseTiff(input, segStart + 6, segEnd);
      }
    }
    i = segEnd;
  }
  return {};
}

function parseTiff(buf: Uint8Array, start: number, end: number): ExifMinimal {
  if (end - start < 8) return {};
  const byte0 = buf[start];
  const byte1 = buf[start + 1];
  let little: boolean;
  if (byte0 === 0x49 && byte1 === 0x49) little = true; // "II"
  else if (byte0 === 0x4d && byte1 === 0x4d) little = false; // "MM"
  else return {};

  const rd = makeReader(buf, little);
  const magic = rd.u16(start + 2);
  if (magic !== 0x002a) return {};
  const ifd0Off = rd.u32(start + 4);
  if (ifd0Off < 8) return {};

  const ifd0 = readIfd(buf, start, start + ifd0Off, end, rd);

  const exifSubIfdOff = ifd0.get(0x8769);
  const gpsIfdOff = ifd0.get(0x8825);

  const out: ExifMinimal = {};

  if (typeof exifSubIfdOff === 'number') {
    const exifEntries = readIfd(buf, start, start + exifSubIfdOff, end, rd);
    const dto = exifEntries.getString(0x9003);
    if (dto) out.DateTimeOriginal = dto;
  }

  if (typeof gpsIfdOff === 'number') {
    const gps = readIfd(buf, start, start + gpsIfdOff, end, rd);
    const latRef = gps.getString(0x0001); // 'N' | 'S'
    const lonRef = gps.getString(0x0003); // 'E' | 'W'
    const latRat = gps.getRationalTriple(0x0002);
    const lonRat = gps.getRationalTriple(0x0004);
    if (latRat) {
      const abs = dmsToDeg(latRat);
      out.GPSLatitude = latRef === 'S' ? -abs : abs;
    }
    if (lonRat) {
      const abs = dmsToDeg(lonRat);
      out.GPSLongitude = lonRef === 'W' ? -abs : abs;
    }
  }

  return out;
}

type Reader = {
  u16: (off: number) => number;
  u32: (off: number) => number;
  u32s: (off: number) => number;
};

function makeReader(buf: Uint8Array, little: boolean): Reader {
  if (little) {
    return {
      u16: (off) => buf[off] | (buf[off + 1] << 8),
      u32: (off) =>
        (buf[off] |
          (buf[off + 1] << 8) |
          (buf[off + 2] << 16) |
          (buf[off + 3] << 24)) >>> 0,
      u32s: (off) =>
        buf[off] |
        (buf[off + 1] << 8) |
        (buf[off + 2] << 16) |
        (buf[off + 3] << 24),
    };
  }
  return {
    u16: (off) => (buf[off] << 8) | buf[off + 1],
    u32: (off) =>
      ((buf[off] << 24) |
        (buf[off + 1] << 16) |
        (buf[off + 2] << 8) |
        buf[off + 3]) >>>
      0,
    u32s: (off) =>
      (buf[off] << 24) |
      (buf[off + 1] << 16) |
      (buf[off + 2] << 8) |
      buf[off + 3],
  };
}

type Ifd = {
  get: (tag: number) => number | string | undefined;
  getString: (tag: number) => string | undefined;
  getRationalTriple: (tag: number) => [number, number, number] | undefined;
};

function readIfd(
  buf: Uint8Array,
  tiffStart: number,
  ifdOff: number,
  end: number,
  rd: Reader,
): Ifd {
  const entries = new Map<number, { type: number; count: number; valueOff: number }>();
  if (ifdOff + 2 > end) return emptyIfd();
  const count = rd.u16(ifdOff);
  const base = ifdOff + 2;
  if (base + count * 12 > end) return emptyIfd();
  for (let k = 0; k < count; k++) {
    const e = base + k * 12;
    const tag = rd.u16(e);
    const type = rd.u16(e + 2);
    const cnt = rd.u32(e + 4);
    const valueOff = e + 8; // value or offset
    entries.set(tag, { type, count: cnt, valueOff });
  }

  function getRaw(tag: number) {
    return entries.get(tag);
  }

  function get(tag: number): number | string | undefined {
    const e = getRaw(tag);
    if (!e) return undefined;
    // SHORT (3)
    if (e.type === 3 && e.count === 1) return rd.u16(e.valueOff);
    // LONG (4)
    if (e.type === 4 && e.count === 1) return rd.u32(e.valueOff);
    // ASCII (2)
    if (e.type === 2) {
      const len = e.count;
      let dataOff: number;
      if (len <= 4) dataOff = e.valueOff;
      else dataOff = tiffStart + rd.u32(e.valueOff);
      if (dataOff + len > end) return undefined;
      let s = '';
      for (let k = 0; k < len; k++) {
        const c = buf[dataOff + k];
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      return s;
    }
    return undefined;
  }

  function getString(tag: number): string | undefined {
    const v = get(tag);
    return typeof v === 'string' ? v : undefined;
  }

  function getRationalTriple(
    tag: number,
  ): [number, number, number] | undefined {
    const e = getRaw(tag);
    if (!e || e.type !== 5 /* RATIONAL */ || e.count !== 3) return undefined;
    const dataOff = tiffStart + rd.u32(e.valueOff);
    if (dataOff + 24 > end) return undefined;
    const r: number[] = [];
    for (let k = 0; k < 3; k++) {
      const num = rd.u32(dataOff + k * 8);
      const den = rd.u32(dataOff + k * 8 + 4);
      r.push(den === 0 ? 0 : num / den);
    }
    return [r[0], r[1], r[2]];
  }

  return { get, getString, getRationalTriple };
}

function emptyIfd(): Ifd {
  return {
    get: () => undefined,
    getString: () => undefined,
    getRationalTriple: () => undefined,
  };
}

function dmsToDeg([d, m, s]: [number, number, number]): number {
  return d + m / 60 + s / 3600;
}
