'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import { logAuditEvent } from '@/lib/auth/audit';
import { logError } from '@/lib/observability/logger';
import { createClientSchema, updateClientSchema } from '@/lib/validations/clients';

export type ClientActionState = { error: string | null };

function isUniqueViolation(message: string | null | undefined): boolean {
  if (!message) return false;
  return /duplicate key|unique constraint|already exists/i.test(message);
}

function readBool(formData: FormData, key: string, defaultWhenNull: boolean): boolean {
  const raw = formData.get(key);
  if (raw === null) return defaultWhenNull;
  return raw === 'on' || raw === 'true';
}

function readForm(formData: FormData) {
  return {
    name: formData.get('name'),
    name_i18n: {
      en: formData.get('name_i18n_en'),
      ar: formData.get('name_i18n_ar'),
    },
    contact_email: formData.get('contact_email') || undefined,
    contact_phone: formData.get('contact_phone') || undefined,
    active: readBool(formData, 'active', true),
    show_promoter_names: readBool(formData, 'show_promoter_names', false),
    show_promoter_photos: readBool(formData, 'show_promoter_photos', false),
    show_promoter_alerts: readBool(formData, 'show_promoter_alerts', false),
    show_promoter_full_profile: readBool(formData, 'show_promoter_full_profile', false),
  };
}

export async function createClientAction(
  _prev: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const actor = await requireAdmin();
  const locale = await getLocale();

  const parsed = createClientSchema.safeParse(readForm(formData));
  if (!parsed.success) return { error: 'unknown' };

  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('clients')
    .insert({
      name: parsed.data.name,
      name_i18n: parsed.data.name_i18n,
      contact_email: parsed.data.contact_email ?? null,
      contact_phone: parsed.data.contact_phone ?? null,
      active: parsed.data.active,
      show_promoter_names: parsed.data.show_promoter_names,
      show_promoter_photos: parsed.data.show_promoter_photos,
      show_promoter_alerts: parsed.data.show_promoter_alerts,
      show_promoter_full_profile: parsed.data.show_promoter_full_profile,
      created_by: actor.id,
    })
    .select('id')
    .single();

  if (error || !data) {
    const isDup = isUniqueViolation(error?.message);
    if (!isDup && error) {
      logError('createClientAction failed', {
        actor_id: actor.id,
        code: error.code,
        message: error.message,
      });
    }
    return { error: isDup ? 'duplicate' : 'unknown' };
  }

  await logAuditEvent({
    actor_id: actor.id,
    action: 'admin.client_created',
    entity: 'client',
    entity_id: data.id,
    after: parsed.data,
  });

  revalidatePath(`/${locale}/admin/clients`);
  redirect(`/${locale}/admin/clients`);
}

export async function updateClientAction(
  _prev: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const actor = await requireAdmin();
  const locale = await getLocale();

  const parsed = updateClientSchema.safeParse({
    id: formData.get('id'),
    ...readForm(formData),
  });
  if (!parsed.success) return { error: 'unknown' };

  const admin = createAdminSupabase();
  const { data: before } = await admin
    .from('clients')
    .select(
      'name, name_i18n, contact_email, contact_phone, active, show_promoter_names, show_promoter_photos, show_promoter_alerts, show_promoter_full_profile',
    )
    .eq('id', parsed.data.id)
    .maybeSingle();

  const { error } = await admin
    .from('clients')
    .update({
      name: parsed.data.name,
      name_i18n: parsed.data.name_i18n,
      contact_email: parsed.data.contact_email ?? null,
      contact_phone: parsed.data.contact_phone ?? null,
      active: parsed.data.active,
      show_promoter_names: parsed.data.show_promoter_names,
      show_promoter_photos: parsed.data.show_promoter_photos,
      show_promoter_alerts: parsed.data.show_promoter_alerts,
      show_promoter_full_profile: parsed.data.show_promoter_full_profile,
    })
    .eq('id', parsed.data.id);

  if (error) {
    const isDup = isUniqueViolation(error.message);
    if (!isDup) {
      logError('updateClientAction failed', {
        actor_id: actor.id,
        client_id: parsed.data.id,
        code: error.code,
        message: error.message,
      });
    }
    return { error: isDup ? 'duplicate' : 'unknown' };
  }

  await logAuditEvent({
    actor_id: actor.id,
    action: 'admin.client_updated',
    entity: 'client',
    entity_id: parsed.data.id,
    before: before ?? null,
    after: parsed.data,
  });

  revalidatePath(`/${locale}/admin/clients`);
  revalidatePath(`/${locale}/admin/clients/${parsed.data.id}/edit`);
  return { error: null };
}
