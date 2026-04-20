// Client-side JPEG compression for selfie uploads.
//
// Why: promoters shoot on modern phones that produce 4000×3000 JPEGs at
// 4+ MB. Uploading those over spotty 3G is painful; they take seconds per
// send and can trigger queue retries (D-010 / Phase 9). Resizing to 1280px
// on the longer side at quality 0.82 typically cuts the payload to
// ~200–400 KB with no perceptible loss for an attendance selfie.
//
// The server still re-validates MIME + magic bytes + strips EXIF, so this
// is pure client-side UX, not a trust boundary.
//
// Exported as an async function on a Blob so it works equally for
// <input type="file" capture="user"> (iOS/Android camera) and for any
// Blob a caller already has in hand.

const DEFAULT_MAX_DIM = 1280;
const DEFAULT_QUALITY = 0.82;
// Original is considered "small enough"; skip the canvas round-trip.
const SKIP_BELOW_BYTES = 400 * 1024;

export type CompressOptions = {
  /** Longer edge in pixels. Shorter edge is scaled to preserve aspect. */
  maxDim?: number;
  /** JPEG quality 0..1. */
  quality?: number;
  /** Skip compression if the input is already below this size. */
  skipBelowBytes?: number;
};

export type CompressResult = {
  blob: Blob;
  /** true if we returned the original unchanged. */
  skipped: boolean;
  /** Original size in bytes. */
  originalBytes: number;
  /** Final size in bytes. */
  finalBytes: number;
  width: number;
  height: number;
};

/**
 * Resize + re-encode a JPEG Blob. Falls back to returning the original
 * Blob unchanged if the browser lacks the needed APIs — the caller's
 * upload path still works, just without compression.
 */
export async function compressJpeg(
  input: Blob,
  opts: CompressOptions = {},
): Promise<CompressResult> {
  const maxDim = Math.max(64, opts.maxDim ?? DEFAULT_MAX_DIM);
  const quality = Math.min(1, Math.max(0.1, opts.quality ?? DEFAULT_QUALITY));
  const skipBelowBytes = opts.skipBelowBytes ?? SKIP_BELOW_BYTES;

  const originalBytes = input.size;

  // Cheap skip: file already small enough.
  if (originalBytes <= skipBelowBytes) {
    return {
      blob: input,
      skipped: true,
      originalBytes,
      finalBytes: originalBytes,
      width: 0,
      height: 0,
    };
  }

  // Browser capability check. In Node / SSR, bail out cleanly.
  if (
    typeof document === 'undefined' ||
    typeof document.createElement !== 'function' ||
    typeof URL === 'undefined'
  ) {
    return {
      blob: input,
      skipped: true,
      originalBytes,
      finalBytes: originalBytes,
      width: 0,
      height: 0,
    };
  }

  const url = URL.createObjectURL(input);
  try {
    const img = await loadImage(url);
    const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, maxDim);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return {
        blob: input,
        skipped: true,
        originalBytes,
        finalBytes: originalBytes,
        width: img.naturalWidth,
        height: img.naturalHeight,
      };
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    const compressed = await canvasToBlob(canvas, 'image/jpeg', quality);
    if (!compressed || compressed.size >= originalBytes) {
      // Compression didn't win — e.g. already-compressed small JPEG on a
      // low-resolution phone. Keep the original.
      return {
        blob: input,
        skipped: true,
        originalBytes,
        finalBytes: originalBytes,
        width,
        height,
      };
    }
    return {
      blob: compressed,
      skipped: false,
      originalBytes,
      finalBytes: compressed.size,
      width,
      height,
    };
  } catch {
    return {
      blob: input,
      skipped: true,
      originalBytes,
      finalBytes: originalBytes,
      width: 0,
      height: 0,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function fitWithin(
  w: number,
  h: number,
  maxDim: number,
): { width: number; height: number } {
  if (w <= 0 || h <= 0) return { width: 0, height: 0 };
  const longer = Math.max(w, h);
  if (longer <= maxDim) return { width: w, height: h };
  const scale = maxDim / longer;
  return {
    width: Math.round(w * scale),
    height: Math.round(h * scale),
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image_load_failed'));
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), type, quality);
  });
}
