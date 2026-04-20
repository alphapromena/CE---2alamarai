import { toCsvWithBom } from '@/lib/utils/csv';

/**
 * Template CSVs for the bulk import feature. One header row + one example row
 * per target. Reuses the BOM-prefixed RFC 4180 writer so Excel opens Arabic
 * cleanly and admins can edit in place.
 */

export type ImportTarget = 'products' | 'promoters' | 'locations';

export const IMPORT_TARGETS = ['products', 'promoters', 'locations'] as const satisfies readonly ImportTarget[];

export function isImportTarget(value: unknown): value is ImportTarget {
  return typeof value === 'string' && (IMPORT_TARGETS as readonly string[]).includes(value);
}

const TEMPLATES: Record<ImportTarget, readonly (readonly (string | number | boolean)[])[]> = {
  // Products = `skus` table. campaign_id required because SKUs are children of campaigns.
  products: [
    ['campaign_id', 'name_en', 'name_ar', 'unit_en', 'unit_ar', 'target', 'stock_allocated', 'active'],
    [
      '00000000-0000-0000-0000-000000000000',
      'Almarai Laban 1L',
      'لبن المراعي 1 لتر',
      'bottle',
      'عبوة',
      500,
      1000,
      true,
    ],
  ],
  promoters: [
    ['email', 'full_name', 'preferred_language', 'phone'],
    ['promoter@example.com', 'Sample Promoter', 'en', '+966500000000'],
  ],
  locations: [
    ['city_id', 'name_en', 'name_ar', 'address', 'lat', 'lng', 'geofence_radius_m'],
    [
      '00000000-0000-0000-0000-000000000000',
      'Sample Hypermarket',
      'هايبر ماركت تجريبي',
      '123 King Fahd Rd',
      24.7136,
      46.6753,
      100,
    ],
  ],
};

export function buildTemplate(target: ImportTarget): string {
  return toCsvWithBom(TEMPLATES[target]);
}

export function templateFilename(target: ImportTarget): string {
  return `import-template-${target}.csv`;
}
