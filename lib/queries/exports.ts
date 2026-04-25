import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';
import { logError } from '@/lib/observability/logger';
import type { ExportFormat, ExportScope } from '@/lib/exports/types';

export type ExportJobRow = {
  id: string;
  requested_by: string;
  client_id: string | null;
  scope: ExportScope;
  format: ExportFormat;
  status: 'queued' | 'running' | 'done' | 'failed';
  result_path: string | null;
  result_size_bytes: number | null;
  error_message: string | null;
  idempotency_key: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  requester_name: string | null;
  client_name: string | null;
};

const SELECT_COLS = `id, requested_by, client_id, scope, format, status,
  result_path, result_size_bytes, error_message, idempotency_key,
  created_at, started_at, completed_at,
  requester:profiles!export_jobs_requested_by_fkey ( full_name ),
  client:clients ( name )`;

type RelOne<T> = T | T[] | null;
const pickOne = <T>(v: RelOne<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function shape(
  r: Omit<ExportJobRow, 'requester_name' | 'client_name'> & {
    requester: RelOne<{ full_name: string | null }>;
    client: RelOne<{ name: string | null }>;
  },
): ExportJobRow {
  return {
    id: r.id,
    requested_by: r.requested_by,
    client_id: r.client_id,
    scope: r.scope,
    format: r.format,
    status: r.status,
    result_path: r.result_path,
    result_size_bytes: r.result_size_bytes,
    error_message: r.error_message,
    idempotency_key: r.idempotency_key,
    created_at: r.created_at,
    started_at: r.started_at,
    completed_at: r.completed_at,
    requester_name: pickOne(r.requester)?.full_name ?? null,
    client_name: pickOne(r.client)?.name ?? null,
  };
}

export async function listExportJobs(limit = 50): Promise<ExportJobRow[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('export_jobs')
    .select(SELECT_COLS)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (!data) return [];
  return (data as unknown as Parameters<typeof shape>[0][]).map(shape);
}

export async function getExportJob(id: string): Promise<ExportJobRow | null> {
  const supabase = await createServerSupabase();
  // Destructure error so DB failures are logged; previous code returned null
  // on both genuine not-found and DB error indistinguishably.
  const { data, error } = await supabase
    .from('export_jobs')
    .select(SELECT_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    logError('getExportJob failed', {
      job_id: id,
      code: error.code,
      message: error.message,
    });
    return null;
  }
  if (!data) return null;
  return shape(data as unknown as Parameters<typeof shape>[0]);
}
