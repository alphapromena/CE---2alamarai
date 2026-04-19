import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/admin';

export type AssignmentRow = {
  id: string;
  user_id: string;
  user_full_name: string | null;
  user_role: string | null;
  location_id: string;
  location_name_i18n: { ar?: string; en?: string } | null;
  shift_id: string | null;
  shift_summary: string | null;
  role_scope: 'promoter' | 'supervisor';
  starts_on: string | null;
  ends_on: string | null;
  active: boolean;
  created_at: string;
};

const SELECT = `
  id, user_id, location_id, shift_id, role_scope, starts_on, ends_on, active, created_at,
  user:profiles ( full_name, role ),
  location:locations ( name_i18n ),
  shift:shifts ( start_time, end_time )
`;

function trimSec(t: string | null): string | null {
  if (!t) return null;
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function flatten(row: unknown): AssignmentRow {
  const r = row as unknown as {
    id: string;
    user_id: string;
    location_id: string;
    shift_id: string | null;
    role_scope: 'promoter' | 'supervisor';
    starts_on: string | null;
    ends_on: string | null;
    active: boolean;
    created_at: string;
    user: { full_name: string; role: string } | null;
    location: { name_i18n: { ar?: string; en?: string } } | null;
    shift: { start_time: string; end_time: string } | null;
  };
  const summary = r.shift ? `${trimSec(r.shift.start_time)} – ${trimSec(r.shift.end_time)}` : null;
  return {
    id: r.id,
    user_id: r.user_id,
    user_full_name: r.user?.full_name ?? null,
    user_role: r.user?.role ?? null,
    location_id: r.location_id,
    location_name_i18n: r.location?.name_i18n ?? null,
    shift_id: r.shift_id,
    shift_summary: summary,
    role_scope: r.role_scope,
    starts_on: r.starts_on,
    ends_on: r.ends_on,
    active: r.active,
    created_at: r.created_at,
  };
}

export async function listAssignments(): Promise<AssignmentRow[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('user_assignments')
    .select(SELECT)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`assignments list failed: ${error.message}`);
  return (data ?? []).map(flatten);
}

export async function getAssignment(id: string): Promise<AssignmentRow | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('user_assignments')
    .select(SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`assignment get failed: ${error.message}`);
  return data ? flatten(data) : null;
}

export async function listAssignableUsers(): Promise<
  { id: string; full_name: string; role: 'promoter' | 'supervisor' }[]
> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('profiles')
    .select('id, full_name, role')
    .in('role', ['promoter', 'supervisor'])
    .eq('active', true)
    .order('full_name', { ascending: true });
  if (error) throw new Error(`assignable-users failed: ${error.message}`);
  return (data ?? []) as unknown as {
    id: string;
    full_name: string;
    role: 'promoter' | 'supervisor';
  }[];
}

export async function listAssignableLocations(): Promise<
  { id: string; name_i18n: { ar?: string; en?: string } }[]
> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('locations')
    .select('id, name_i18n')
    .eq('active', true)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`assignable-locations failed: ${error.message}`);
  return (data ?? []) as { id: string; name_i18n: { ar?: string; en?: string } }[];
}

export async function listShiftsForLocation(locationId: string): Promise<
  {
    id: string;
    start_time: string;
    end_time: string;
    days_of_week: number[];
    campaign_name_i18n: { ar?: string; en?: string } | null;
  }[]
> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('shifts')
    .select('id, start_time, end_time, days_of_week, campaign:campaigns ( name_i18n )')
    .eq('location_id', locationId)
    .eq('active', true);
  if (error) throw new Error(`shifts-for-location failed: ${error.message}`);
  return (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      start_time: string;
      end_time: string;
      days_of_week: number[];
      campaign: { name_i18n: { ar?: string; en?: string } } | null;
    };
    return {
      id: r.id,
      start_time: r.start_time,
      end_time: r.end_time,
      days_of_week: r.days_of_week ?? [],
      campaign_name_i18n: r.campaign?.name_i18n ?? null,
    };
  });
}
