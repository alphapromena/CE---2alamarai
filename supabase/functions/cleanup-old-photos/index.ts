// cleanup-old-photos — Feature 4 / D-041: 90-day retention for attendance
// selfies + supervisor visit photos in the `attendance-photos` bucket.
//
// Flow per invocation:
//   1. Walk `attendance/{user_id}/{date}/` prefixes; any object older than
//      RETENTION_DAYS is deleted from storage AND the matching row in
//      public.attendance has `check_in_photo_path` / `check_out_photo_path`
//      nulled if it still points at the deleted object.
//   2. Walk `visits/{supervisor_id}/{date}/` prefixes; any object older than
//      RETENTION_DAYS is deleted from storage AND the matching
//      public.supervisor_visits.photo_path is nulled.
//
// supervisor_visits.photo_path was NOT NULL in Phase 3 (Feature 4 keeps it
// that way for forward rows). We intentionally do NOT null old rows on the
// visits side unless the column is nullable in the schema. Today it's NOT
// NULL, so the cleanup deletes the storage object only and leaves the path
// string behind as a historical reference. When/if we relax the constraint,
// the commented-out line below becomes active.
//
// Auth: verify_jwt = false. A shared CRON_SECRET header is required (same
// trust model as detect-attendance-issues).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.3';

const RETENTION_DAYS = 90;
const BUCKET = 'attendance-photos';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

type StorageObject = {
  name: string;
  created_at: string | null;
  updated_at: string | null;
};

async function listAllObjects(
  admin: ReturnType<typeof createClient>,
  prefix: string,
): Promise<StorageObject[]> {
  const out: StorageObject[] = [];
  const pageSize = 1000;
  let offset = 0;
  // Storage list API is shallow per path. We traverse recursively.
  const stack: string[] = [prefix];
  while (stack.length > 0) {
    const current = stack.pop()!;
    offset = 0;
    while (true) {
      const { data, error } = await admin.storage
        .from(BUCKET)
        .list(current, { limit: pageSize, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error || !data) break;
      for (const entry of data) {
        const e = entry as unknown as { id: string | null; name: string; created_at: string | null; updated_at: string | null };
        if (e.id === null) {
          // A folder — recurse into it.
          stack.push(current ? `${current}/${e.name}` : e.name);
        } else {
          out.push({
            name: current ? `${current}/${e.name}` : e.name,
            created_at: e.created_at,
            updated_at: e.updated_at,
          });
        }
      }
      if (data.length < pageSize) break;
      offset += pageSize;
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, { status: 405 });
  }
  const providedSecret = req.headers.get('x-cron-secret') ?? '';
  if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const attendanceObjects = await listAllObjects(admin, 'attendance');
  const visitObjects = await listAllObjects(admin, 'visits');

  const attendanceToDelete = attendanceObjects.filter((o) => {
    const created = o.created_at ? new Date(o.created_at) : null;
    return created != null && created < cutoff;
  });
  const visitsToDelete = visitObjects.filter((o) => {
    const created = o.created_at ? new Date(o.created_at) : null;
    return created != null && created < cutoff;
  });

  let attendanceDeleted = 0;
  let attendanceRowsUpdated = 0;
  if (attendanceToDelete.length > 0) {
    const paths = attendanceToDelete.map((o) => o.name);
    const { error: rmErr } = await admin.storage.from(BUCKET).remove(paths);
    if (!rmErr) {
      attendanceDeleted = paths.length;
      // Null the matching column on any attendance row pointing at a deleted path.
      // One UPDATE per leg since the column differs; rows where path is NULL are
      // unaffected by the IN check.
      const { data: inRes } = await admin
        .from('attendance')
        .update({ check_in_photo_path: null })
        .in('check_in_photo_path', paths)
        .select('id');
      const { data: outRes } = await admin
        .from('attendance')
        .update({ check_out_photo_path: null })
        .in('check_out_photo_path', paths)
        .select('id');
      attendanceRowsUpdated = (inRes?.length ?? 0) + (outRes?.length ?? 0);
    }
  }

  let visitsDeleted = 0;
  if (visitsToDelete.length > 0) {
    const paths = visitsToDelete.map((o) => o.name);
    const { error: rmErr } = await admin.storage.from(BUCKET).remove(paths);
    if (!rmErr) {
      visitsDeleted = paths.length;
      // NOTE: supervisor_visits.photo_path is NOT NULL today. We do not null
      // the column here; the row keeps a reference to a now-deleted object.
      // Enable the UPDATE below if/when the constraint is relaxed.
      // await admin.from('supervisor_visits').update({ photo_path: null }).in('photo_path', paths);
    }
  }

  return json({
    ok: true,
    ran_at: new Date().toISOString(),
    retention_days: RETENTION_DAYS,
    attendance_scanned: attendanceObjects.length,
    attendance_deleted: attendanceDeleted,
    attendance_rows_updated: attendanceRowsUpdated,
    visits_scanned: visitObjects.length,
    visits_deleted: visitsDeleted,
  });
});
