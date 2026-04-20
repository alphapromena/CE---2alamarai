import { describe, expect, it } from 'vitest';
import { compressJpeg, fitWithin } from './compress';

describe('lib/images/compress — fitWithin', () => {
  it('returns the input unchanged when already inside the bound', () => {
    expect(fitWithin(800, 600, 1280)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1280, 720, 1280)).toEqual({ width: 1280, height: 720 });
  });

  it('scales landscape so longer edge equals maxDim', () => {
    const r = fitWithin(4000, 3000, 1280);
    expect(r.width).toBe(1280);
    expect(r.height).toBe(960);
  });

  it('scales portrait so longer edge equals maxDim', () => {
    const r = fitWithin(3000, 4000, 1280);
    expect(r.height).toBe(1280);
    expect(r.width).toBe(960);
  });

  it('returns zeros on zero/negative inputs', () => {
    expect(fitWithin(0, 100, 200)).toEqual({ width: 0, height: 0 });
    expect(fitWithin(-1, 100, 200)).toEqual({ width: 0, height: 0 });
    expect(fitWithin(100, 0, 200)).toEqual({ width: 0, height: 0 });
  });

  it('handles a square image', () => {
    const r = fitWithin(2048, 2048, 1280);
    expect(r.width).toBe(1280);
    expect(r.height).toBe(1280);
  });
});

describe('lib/images/compress — compressJpeg', () => {
  it('short-circuits when the blob is below skipBelowBytes', async () => {
    // 200 KB dummy blob — below the 400 KB default skip threshold.
    const data = new Uint8Array(200 * 1024);
    const blob = new Blob([data], { type: 'image/jpeg' });
    const result = await compressJpeg(blob);
    expect(result.skipped).toBe(true);
    expect(result.blob).toBe(blob);
    expect(result.originalBytes).toBe(200 * 1024);
    expect(result.finalBytes).toBe(200 * 1024);
  });

  it('returns original in node/SSR when document is unavailable', async () => {
    // No DOM in vitest's node environment, and the 600 KB blob is above
    // the skip threshold so we actually hit the document-check guard.
    const data = new Uint8Array(600 * 1024);
    const blob = new Blob([data], { type: 'image/jpeg' });
    const result = await compressJpeg(blob);
    expect(result.skipped).toBe(true);
    expect(result.blob).toBe(blob);
  });

  it('honors a custom skipBelowBytes', async () => {
    const data = new Uint8Array(100 * 1024);
    const blob = new Blob([data], { type: 'image/jpeg' });
    const result = await compressJpeg(blob, { skipBelowBytes: 50 * 1024 });
    // 100 KB > 50 KB, so we attempt compression; in node we still fall
    // through to the document-check guard and return original.
    expect(result.blob).toBe(blob);
  });
});
