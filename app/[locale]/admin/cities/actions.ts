'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import { logAuditEvent } from '@/lib/auth/audit';
import { logError } from '@/lib/observability/logger';
import { createCitySchema, updateCitySchema } from '@/lib/validations/cities';

export type CityActionState = { error: string | null };

function isUniqueViolation(message: string | null | undefined): boolean {
  if (!message) return false;
  return /duplicate key|unique constraint|already exists/i.test(message);
}

function readForm(formData: FormData) {
  const active = formData.get('active');
  return {
    region_id: formData.get('region_id'),
    name_i18n: {
      en: formData.get('name_i18n_en'),
      ar: formData.get('name_i18n_ar'),
    },
    active: active === 'on' || active === 'true' || active === null,
  };
}

export async function createCityAction(
  _prev: CityActionState,
  formData: FormData,
): Promise<CityActionState> {
  const actor = await requireAdmin();
  const locale = await getLocale();

  const parsed = createCitySchema.safeParse(readForm(formData));
  if (!parsed.success) return { error: 'unknown' };

  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('cities')
    .insert({
      region_id: parsed.data.region_id,
      name_i18n: parsed.data.name_i18n,
      active: parsed.data.active,
    })
    .select('id')
    .single();

  if (error || !data) {
    const isDup = isUniqueViolation(error?.message);
    if (!isDup && error) {
      logError('createCityAction failed', {
        actor_id: actor.id,
        region_id: parsed.data.region_id,
        code: error.code,
        message: error.message,
      });
    }
    return { error: isDup ? 'duplicate' : 'unknown' };
  }

  await logAuditEvent({
    actor_id: actor.id,
    action: 'admin.city_created',
    entity: 'city',
    entity_id: data.id,
    after: parsed.data,
  });

  revalidatePath(`/${locale}/admin/cities`);
  redirect(`/${locale}/admin/cities`);
}

export async function updateCityAction(
  _prev: CityActionState,
  formData: FormData,
): Promise<CityActionState> {
  const actor = await requireAdmin();
  const locale = await getLocale();

  const parsed = updateCitySchema.safeParse({
    id: formData.get('id'),
    ...readForm(formData),
  });
  if (!parsed.success) return { error: 'unknown' };

  const admin = createAdminSupabase();
  const { data: before } = await admin
    .from('cities')
    .select('region_id, name_i18n, active')
    .eq('id', parsed.data.id)
    .maybeSingle();

  const { error } = await admin
    .from('cities')
    .update({
      region_id: parsed.data.region_id,
      name_i18n: parsed.data.name_i18n,
      active: parsed.data.active,
    })
    .eq('id', parsed.data.id);

  if (error) {
    const isDup = isUniqueViolation(error.message);
    if (!isDup) {
      logError('updateCityAction failed', {
        actor_id: actor.id,
        city_id: parsed.data.id,
        code: error.code,
        message: error.message,
      });
    }
    return { error: isDup ? 'duplicate' : 'unknown' };
  }

  await logAuditEvent({
    actor_id: actor.id,
    action: 'admin.city_updated',
    entity: 'city',
    entity_id: parsed.data.id,
    before: before ?? null,
    after: parsed.data,
  });

  revalidatePath(`/${locale}/admin/cities`);
  revalidatePath(`/${locale}/admin/cities/${parsed.data.id}/edit`);
  return { error: null };
}
