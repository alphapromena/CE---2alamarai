'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import { logAuditEvent } from '@/lib/auth/audit';
import { createClientSchema, updateClientSchema } from '@/lib/validations/clients';

export type ClientActionState = { error: string | null };

function isUniqueViolation(message: string | null | undefined): boolean {
  if (!message) return false;
  return /duplicate key|unique constraint|already exists/i.test(message);
}

function readForm(formData: FormData) {
  const active = formData.get('active');
  return {
    name: formData.get('name'),
    name_i18n: {
      en: formData.get('name_i18n_en'),
      ar: formData.get('name_i18n_ar'),
    },
    contact_email: formData.get('contact_email') || undefined,
    contact_phone: formData.get('contact_phone') || undefined,
    active: active === 'on' || active === 'true' || active === null,
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
      created_by: actor.id,
    })
    .select('id')
    .single();

  if (error || !data) {
    return { error: isUniqueViolation(error?.message) ? 'duplicate' : 'unknown' };
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
    .select('name, name_i18n, contact_email, contact_phone, active')
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
    })
    .eq('id', parsed.data.id);

  if (error) {
    return { error: isUniqueViolation(error.message) ? 'duplicate' : 'unknown' };
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
