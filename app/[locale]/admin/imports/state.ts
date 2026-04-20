// Non-action exports for the bulk-import flow. Kept out of `actions.ts`
// because Next.js 15 only allows `async function` exports in a file with
// the `"use server"` directive — types and constants live here.

import type { ImportTarget } from '@/lib/imports/templates';

export type RowFailure = { row: number; error: string };

export type BulkImportState =
  | { kind: 'idle' }
  | { kind: 'error'; error: string }
  | { kind: 'done'; target: ImportTarget; successCount: number; failedRows: RowFailure[] };

export const initialBulkImportState: BulkImportState = { kind: 'idle' };
