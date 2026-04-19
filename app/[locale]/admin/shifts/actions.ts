'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import { logAuditEvent } from '@/lib/auth/audit';
import { createShiftSchema, updateShiftSchema } from '@/lib/validations/shifts';

export type ShiftActionState = { error: string | null };

function readForm(formData: FormData) {
  const active = formData.get('active');
  // days_of_week comes as a comma-separated hidden input from the client widget.
  const rawDays = formData.get('days_of_week');
  const days =
    typeof rawDays === 'string' && rawDays.length > 0
      ? rawDays.split(',').map((d) => Number(d))
      : [];
  return {
    campaign_id: formData.get('campaign_id'),
    location_id: formData.get('location_id'),
    start_time: formData.get('start_time'),
    end_time: formData.get('end_time'),
    days_of_week: days,
    active: active === 'on' || active === 'true' || active === null,
  };
}

export async function createShiftAction(
  _prev: ShiftActionState,
  formData: FormData,
): Promise<ShiftActionState> {
  const actor = await requireAdmin();
  const locale = await getLocale();

  const parsed = createShiftSchema.safeParse(readForm(formData));
  if (!parsed.success) return { error: 'unknown' };

  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('shifts')
    .insert({
      campaign_id: parsed.data.campaign_id,
      location_id: parsed.data.location_id,
      start_time: parsed.data.start_time,
      end_time: parsed.data.end_time,
      days_of_week: parsed.data.days_of_week,
      active: parsed.data.active,
    })
    .select('id')
    .single();

  if (error || !data) return { error: 'unknown' };

  await logAuditEvent({
    actor_id: actor.id,
    action: 'admin.shift_created',
    entity: 'shift',
    entity_id: data.id,
    after: parsed.data,
  });

  revalidatePath(`/${locale}/admin/shifts`);
  redirect(`/${locale}/admin/shifts`);
}

export async function updateShiftAction(
  _prev: ShiftActionState,
  formData: FormData,
): Promise<ShiftActionState> {
  const actor = await requireAdmin();
  const locale = await getLocale();

  const parsed = updateShiftSchema.safeParse({
    id: formData.get('id'),
    ...readForm(formData),
  });
  if (!parsed.success) return { error: 'unknown' };

  const admin = createAdminSupabase();
  const { data: before } = await admin
    .from('shifts')
    .select('campaign_id, location_id, start_time, end_time, days_of_week, active')
    .eq('id', parsed.data.id)
    .maybeSingle();

  const { error } = await admin
    .from('shifts')
    .update({
      campaign_id: parsed.data.campaign_id,
      location_id: parsed.data.location_id,
      start_time: parsed.data.start_time,
      end_time: parsed.data.end_time,
      days_of_week: parsed.data.days_of_week,
      active: parsed.data.active,
    })
    .eq('id', parsed.data.id);

  if (error) return { error: 'unknown' };

  await logAuditEvent({
    actor_id: actor.id,
    action: 'admin.shift_updated',
    entity: 'shift',
    entity_id: parsed.data.id,
    before: before ?? null,
    after: parsed.data,
  });

  revalidatePath(`/${locale}/admin/shifts`);
  revalidatePath(`/${locale}/admin/shifts/${parsed.data.id}/edit`);
  return { error: null };
}
