import { z } from 'zod';
import { ALL_EXPORT_DOMAINS, type ExportDomain } from '@/lib/exports/types';

const UUID = z.string().uuid();
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const domainSchema = z.enum(
  ALL_EXPORT_DOMAINS as readonly [ExportDomain, ...ExportDomain[]],
);

export const exportScopeSchema = z.strictObject({
  campaign_ids: z.array(UUID),
  location_ids: z.array(UUID),
  sku_ids: z.array(UUID),
  from_date: DATE,
  to_date: DATE,
  domains: z.array(domainSchema).min(1),
});
export type ExportScopeInput = z.infer<typeof exportScopeSchema>;

export const queueExportSchema = z
  .strictObject({
    scope: exportScopeSchema,
    format: z.enum(['csv_zip', 'xlsx']),
    client_id: UUID.nullable().optional(),
    idempotency_key: UUID,
  })
  .refine((v) => v.scope.from_date <= v.scope.to_date, {
    path: ['scope', 'to_date'],
    message: 'to_date must be on or after from_date',
  });
export type QueueExportInput = z.infer<typeof queueExportSchema>;

export const downloadExportSchema = z.strictObject({ id: UUID });
