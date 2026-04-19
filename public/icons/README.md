# PWA icons

Replace these placeholders with the brand logo before production launch.

Required sizes (referenced in `/public/manifest.json`):

- `icon-192.png` — 192×192, PNG, maskable + any
- `icon-512.png` — 512×512, PNG, maskable + any

Generation tool suggestion: https://realfavicongenerator.net or
`pwa-asset-generator` from a single 1024×1024 source.

Until real icons land, the manifest references files that don't exist
yet — installable PWA prompts will be suppressed by the browser. This
is intentional for Phase 0; brand icons come with the design polish
pass in Phase 9.
