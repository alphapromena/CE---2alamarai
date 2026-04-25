'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import { logAuditEvent } from '@/lib/auth/audit';
import { logError } from '@/lib/observability/logger';
import { createLocationSchema, updateLocationSchema } from '@/lib/validations/locations';

export type LocationActionState = { error: string | null };

function isUniqueViolation(message: string | null | undefined): boolean {
  if (!message) return false;
  return /duplicate key|unique constraint|already exists/i.test(message);
}

function readForm(formData: FormData) {
  const active = formData.get('active');
  return {
    city_id: formData.get('city_id'),
    name_i18n: {
      en: formData.get('name_i18n_en'),
      ar: formData.get('name_i18n_ar'),
    },
    address: formData.get('address') || undefined,
    lat: formData.get('lat'),
    lng: formData.get('lng'),
    geofence_radius_m: formData.get('geofence_radius_m'),
    active: active === 'on' || active === 'true' || active === null,
  };
}

export async function createLocationAction(
  _prev: LocationActionState,
  formData: FormData,
): Promise<LocationActionState> {
  const actor = await requireAdmin();
  const locale = await getLocale();

  const parsed = createLocationSchema.safeParse(readForm(formData));
  if (!parsed.success) return { error: 'unknown' };

  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('locations')
    .insert({
      city_id: parsed.data.city_id,
      name_i18n: parsed.data.name_i18n,
      address: parsed.data.address ?? null,
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      geofence_radius_m: parsed.data.geofence_radius_m,
      active: parsed.data.active,
    })
    .select('id')
    .single();

  if (error || !data) {
    const isDup = isUniqueViolation(error?.message);
    if (!isDup && error) {
      logError('createLocationAction failed', {
        actor_id: actor.id,
        city_id: parsed.data.city_id,
        code: error.code,
        message: error.message,
      });
    }
    return { error: isDup ? 'duplicate' : 'unknown' };
  }

  await logAuditEvent({
    actor_id: actor.id,
    action: 'admin.location_created',
    entity: 'location',
    entity_id: data.id,
    after: parsed.data,
  });

  revalidatePath(`/${locale}/admin/locations`);
  redirect(`/${locale}/admin/locations`);
}

export async function updateLocationAction(
  _prev: LocationActionState,
  formData: FormData,
): Promise<LocationActionState> {
  const actor = await requireAdmin();
  const locale = await getLocale();

  const parsed = updateLocationSchema.safeParse({
    id: formData.get('id'),
    ...readForm(formData),
  });
  if (!parsed.success) return { error: 'unknown' };

  const admin = createAdminSupabase();
  const { data: before } = await admin
    .from('locations')
    .select('city_id, name_i18n, address, lat, lng, geofence_radius_m, active')
    .eq('id', parsed.data.id)
    .maybeSingle();

  const { error } = await admin
    .from('locations')
    .update({
      city_id: parsed.data.city_id,
      name_i18n: parsed.data.name_i18n,
      address: parsed.data.address ?? null,
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      geofence_radius_m: parsed.data.geofence_radius_m,
      active: parsed.data.active,
    })
    .eq('id', parsed.data.id);

  if (error) {
    const isDup = isUniqueViolation(error.message);
    if (!isDup) {
      logError('updateLocationAction failed', {
        actor_id: actor.id,
        location_id: parsed.data.id,
        code: error.code,
        message: error.message,
      });
    }
    return { error: isDup ? 'duplicate' : 'unknown' };
  }

  await logAuditEvent({
    actor_id: actor.id,
    action: 'admin.location_updated',
    entity: 'location',
    entity_id: parsed.data.id,
    before: before ?? null,
    after: parsed.data,
  });

  revalidatePath(`/${locale}/admin/locations`);
  revalidatePath(`/${locale}/admin/locations/${parsed.data.id}/edit`);
  return { error: null };
}
