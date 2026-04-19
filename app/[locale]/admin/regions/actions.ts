'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import { logAuditEvent } from '@/lib/auth/audit';
import { createRegionSchema, updateRegionSchema } from '@/lib/validations/regions';

export type RegionActionState = { error: string | null };

function isUniqueViolation(message: string | null | undefined): boolean {
  if (!message) return false;
  return /duplicate key|unique constraint|already exists/i.test(message);
}

function readForm(formData: FormData) {
  const active = formData.get('active');
  return {
    name_i18n: {
      en: formData.get('name_i18n_en'),
      ar: formData.get('name_i18n_ar'),
    },
    country_code: formData.get('country_code'),
    active: active === 'on' || active === 'true' || active === null,
  };
}

export async function createRegionAction(
  _prev: RegionActionState,
  formData: FormData,
): Promise<RegionActionState> {
  const actor = await requireAdmin();
  const locale = await getLocale();

  const parsed = createRegionSchema.safeParse(readForm(formData));
  if (!parsed.success) return { error: 'unknown' };

  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('regions')
    .insert({
      name_i18n: parsed.data.name_i18n,
      country_code: parsed.data.country_code,
      active: parsed.data.active,
    })
    .select('id')
    .single();

  if (error || !data) {
    return { error: isUniqueViolation(error?.message) ? 'duplicate' : 'unknown' };
  }

  await logAuditEvent({
    actor_id: actor.id,
    action: 'admin.region_created',
    entity: 'region',
    entity_id: data.id,
    after: parsed.data,
  });

  revalidatePath(`/${locale}/admin/regions`);
  redirect(`/${locale}/admin/regions`);
}

export async function updateRegionAction(
  _prev: RegionActionState,
  formData: FormData,
): Promise<RegionActionState> {
  const actor = await requireAdmin();
  const locale = await getLocale();

  const parsed = updateRegionSchema.safeParse({
    id: formData.get('id'),
    ...readForm(formData),
  });
  if (!parsed.success) return { error: 'unknown' };

  const admin = createAdminSupabase();
  const { data: before } = await admin
    .from('regions')
    .select('name_i18n, country_code, active')
    .eq('id', parsed.data.id)
    .maybeSingle();

  const { error } = await admin
    .from('regions')
    .update({
      name_i18n: parsed.data.name_i18n,
      country_code: parsed.data.country_code,
      active: parsed.data.active,
    })
    .eq('id', parsed.data.id);

  if (error) return { error: isUniqueViolation(error.message) ? 'duplicate' : 'unknown' };

  await logAuditEvent({
    actor_id: actor.id,
    action: 'admin.region_updated',
    entity: 'region',
    entity_id: parsed.data.id,
    before: before ?? null,
    after: parsed.data,
  });

  revalidatePath(`/${locale}/admin/regions`);
  revalidatePath(`/${locale}/admin/regions/${parsed.data.id}/edit`);
  return { error: null };
}
