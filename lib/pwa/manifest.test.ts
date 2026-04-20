import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Shape check on the shipped web app manifest. Keeps Lighthouse's required
// fields from silently regressing when someone edits the file by hand, and
// asserts the icon set matches the on-disk PNGs emitted by
// scripts/generate-pwa-icons.mjs.

type ManifestIcon = {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
};

type Manifest = {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: string;
  orientation: string;
  background_color: string;
  theme_color: string;
  lang: string;
  dir: string;
  categories: string[];
  icons: ManifestIcon[];
  shortcuts: Array<{ name: string; url: string; icons: ManifestIcon[] }>;
};

const manifest: Manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/manifest.json'), 'utf8'),
);

describe('public/manifest.json', () => {
  it('declares every field required by Lighthouse PWA audit', () => {
    expect(manifest.name.length).toBeGreaterThan(0);
    expect(manifest.short_name.length).toBeGreaterThan(0);
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('covers the Android + Apple-touch size matrix', () => {
    const sizes = manifest.icons
      .filter((icon) => icon.purpose === 'any' || icon.purpose === undefined)
      .map((icon) => icon.sizes);
    for (const s of ['192x192', '512x512']) {
      expect(sizes).toContain(s);
    }
  });

  it('has a single-purpose maskable icon (Lighthouse requirement)', () => {
    const maskable = manifest.icons.filter((icon) => icon.purpose === 'maskable');
    expect(maskable).toHaveLength(1);
    expect(maskable[0].sizes).toBe('512x512');
    expect(maskable[0].purpose).toBe('maskable'); // not 'any maskable'
  });

  it('splits purpose per-entry (no mixed "any maskable")', () => {
    for (const icon of manifest.icons) {
      if (icon.purpose) {
        expect(icon.purpose.split(' ')).toHaveLength(1);
      }
    }
  });

  it('declares role shortcuts with locale-prefixed URLs', () => {
    expect(manifest.shortcuts.length).toBeGreaterThanOrEqual(3);
    for (const shortcut of manifest.shortcuts) {
      expect(shortcut.url).toMatch(/^\/(en|ar)\//);
      expect(shortcut.name.length).toBeGreaterThan(0);
      expect(shortcut.icons.length).toBeGreaterThan(0);
    }
  });

  it('every referenced icon resolves to an on-disk PNG', () => {
    const refs = new Set<string>();
    for (const icon of manifest.icons) refs.add(icon.src);
    for (const shortcut of manifest.shortcuts) for (const i of shortcut.icons) refs.add(i.src);

    for (const ref of refs) {
      expect(ref.startsWith('/')).toBe(true);
      const bytes = readFileSync(resolve(process.cwd(), 'public', ref.replace(/^\//, '')));
      // PNG signature: 89 50 4E 47 0D 0A 1A 0A
      expect(bytes.subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
    }
  });
});
