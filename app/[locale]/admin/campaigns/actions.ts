'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import { logAuditEvent } from '@/lib/auth/audit';
import { logError } from '@/lib/observability/logger';
import {
  createCampaignSchema,
  updateCampaignSchema,
  setCampaignLocationsSchema,
  createSkuSchema,
  updateSkuSchema,
  deleteSkuSchema,
} from '@/lib/validations/campaigns';

export type CampaignActionState = { error: string | null; createdId?: string };

function isUniqueViolation(message: string | null | undefined): boolean {
  if (!message) return false;
  return /duplicate key|unique constraint|already exists/i.test(message);
}

function readCampaignForm(formData: FormData) {
  return {
    client_id: formData.get('client_id'),
    name_i18n: {
      en: formData.get('name_i18n_en'),
      ar: formData.get('name_i18n_ar'),
    },
    start_date: formData.get('start_date'),
    end_date: formData.get('end_date'),
    objectives: formData.get('objectives') || undefined,
    sampling_rate_denominator: formData.get('sampling_rate_denominator') ?? 'contacts',
    status: formData.get('status') ?? 'planned',
  };
}

export async function createCampaignAction(
  _prev: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  const actor = await requireAdmin();
  const locale = await getLocale();

  const parsed = createCampaignSchema.safeParse(readCampaignForm(formData));
  if (!parsed.success) return { error: 'unknown' };

  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('campaigns')
    .insert({
      client_id: parsed.data.client_id,
      name_i18n: parsed.data.name_i18n,
      start_date: parsed.data.start_date,
      end_date: parsed.data.end_date,
      objectives: parsed.data.objectives ?? null,
      kpi_config: { sampling_rate_denominator: parsed.data.sampling_rate_denominator },
      status: parsed.data.status,
      created_by: actor.id,
    })
    .select('id')
    .single();

  if (error || !data) {
    const isDup = isUniqueViolation(error?.message);
    if (!isDup && error) {
      logError('createCampaignAction failed', {
        actor_id: actor.id,
        client_id: parsed.data.client_id,
        code: error.code,
        message: error.message,
      });
    }
    return { error: isDup ? 'duplicate' : 'unknown' };
  }

  await logAuditEvent({
    actor_id: actor.id,
    action: 'admin.campaign_created',
    entity: 'campaign',
    entity_id: data.id,
    after: parsed.data,
  });

  revalidatePath(`/${locale}/admin/campaigns`);
  redirect(`/${locale}/admin/campaigns/${data.id}/edit`);
}

export async function updateCampaignAction(
  _prev: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  const actor = await requireAdmin();
  const locale = await getLocale();

  const parsed = updateCampaignSchema.safeParse({
    id: formData.get('id'),
    ...readCampaignForm(formData),
  });
  if (!parsed.success) return { error: 'unknown' };

  const admin = createAdminSupabase();
  const { data: before } = await admin
    .from('campaigns')
    .select('client_id, name_i18n, start_date, end_date, objectives, kpi_config, status')
    .eq('id', parsed.data.id)
    .maybeSingle();

  const { error } = await admin
    .from('campaigns')
    .update({
      client_id: parsed.data.client_id,
      name_i18n: parsed.data.name_i18n,
      start_date: parsed.data.start_date,
      end_date: parsed.data.end_date,
      objectives: parsed.data.objectives ?? null,
      kpi_config: { sampling_rate_denominator: parsed.data.sampling_rate_denominator },
      status: parsed.data.status,
    })
    .eq('id', parsed.data.id);

  if (error) {
    const isDup = isUniqueViolation(error.message);
    if (!isDup) {
      logError('updateCampaignAction failed', {
        actor_id: actor.id,
        campaign_id: parsed.data.id,
        code: error.code,
        message: error.message,
      });
    }
    return { error: isDup ? 'duplicate' : 'unknown' };
  }

  await logAuditEvent({
    actor_id: actor.id,
    action: 'admin.campaign_updated',
    entity: 'campaign',
    entity_id: parsed.data.id,
    before: before ?? null,
    after: parsed.data,
  });

  revalidatePath(`/${locale}/admin/campaigns`);
  revalidatePath(`/${locale}/admin/campaigns/${parsed.data.id}/edit`);
  return { error: null };
}

export type ChildActionState = { error: string | null };

export async function setCampaignLocationsAction(
  _prev: ChildActionState,
  formData: FormData,
): Promise<ChildActionState> {
  const actor = await requireAdmin();
  const locale = await getLocale();
  const rawIds = formData.getAll('location_ids').map(String).filter(Boolean);

  const parsed = setCampaignLocationsSchema.safeParse({
    campaign_id: formData.get('campaign_id'),
    location_ids: rawIds,
  });
  if (!parsed.success) return { error: 'unknown' };

  const admin = createAdminSupabase();

  // Replace strategy: read current set, compute add/remove diff, run two
  // smaller mutations rather than DELETE-ALL + INSERT (which would lose any
  // historical FK trail downstream phases may depend on).
  const { data: currentRows, error: fetchErr } = await admin
    .from('campaign_locations')
    .select('location_id')
    .eq('campaign_id', parsed.data.campaign_id);
  if (fetchErr) {
    logError('setCampaignLocationsAction fetch failed', {
      actor_id: actor.id,
      campaign_id: parsed.data.campaign_id,
      code: fetchErr.code,
      message: fetchErr.message,
    });
    return { error: 'unknown' };
  }

  const current = new Set((currentRows ?? []).map((r) => r.location_id as string));
  const next = new Set(parsed.data.location_ids);
  const toRemove = [...current].filter((x) => !next.has(x));
  const toAdd = [...next].filter((x) => !current.has(x));

  if (toRemove.length > 0) {
    const { error } = await admin
      .from('campaign_locations')
      .delete()
      .eq('campaign_id', parsed.data.campaign_id)
      .in('location_id', toRemove);
    if (error) {
      logError('setCampaignLocationsAction delete failed', {
        actor_id: actor.id,
        campaign_id: parsed.data.campaign_id,
        remove_count: toRemove.length,
        code: error.code,
        message: error.message,
      });
      return { error: 'unknown' };
    }
  }

  if (toAdd.length > 0) {
    const { error } = await admin
      .from('campaign_locations')
      .insert(toAdd.map((location_id) => ({ campaign_id: parsed.data.campaign_id, location_id })));
    if (error) {
      logError('setCampaignLocationsAction insert failed', {
        actor_id: actor.id,
        campaign_id: parsed.data.campaign_id,
        add_count: toAdd.length,
        code: error.code,
        message: error.message,
      });
      return { error: 'unknown' };
    }
  }

  await logAuditEvent({
    actor_id: actor.id,
    action: 'admin.campaign_locations_set',
    entity: 'campaign',
    entity_id: parsed.data.campaign_id,
    before: { location_ids: [...current] },
    after: { location_ids: parsed.data.location_ids },
  });

  revalidatePath(`/${locale}/admin/campaigns/${parsed.data.campaign_id}/edit`);
  return { error: null };
}

function readSkuForm(formData: FormData) {
  return {
    campaign_id: formData.get('campaign_id'),
    name_i18n: {
      en: formData.get('name_i18n_en'),
      ar: formData.get('name_i18n_ar'),
    },
    unit_i18n: {
      en: formData.get('unit_i18n_en'),
      ar: formData.get('unit_i18n_ar'),
    },
    target: formData.get('target'),
    stock_allocated: formData.get('stock_allocated'),
    active: formData.get('active') !== 'false',
  };
}

export async function createSkuAction(
  _prev: ChildActionState,
  formData: FormData,
): Promise<ChildActionState> {
  const actor = await requireAdmin();
  const locale = await getLocale();

  const parsed = createSkuSchema.safeParse(readSkuForm(formData));
  if (!parsed.success) return { error: 'unknown' };

  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('skus')
    .insert({
      campaign_id: parsed.data.campaign_id,
      name_i18n: parsed.data.name_i18n,
      unit_i18n: parsed.data.unit_i18n,
      target: parsed.data.target,
      stock_allocated: parsed.data.stock_allocated,
      active: parsed.data.active,
    })
    .select('id')
    .single();

  if (error || !data) {
    const isDup = isUniqueViolation(error?.message);
    if (!isDup && error) {
      logError('createSkuAction failed', {
        actor_id: actor.id,
        campaign_id: parsed.data.campaign_id,
        code: error.code,
        message: error.message,
      });
    }
    return { error: isDup ? 'duplicate' : 'unknown' };
  }

  await logAuditEvent({
    actor_id: actor.id,
    action: 'admin.sku_created',
    entity: 'sku',
    entity_id: data.id,
    after: parsed.data,
  });

  revalidatePath(`/${locale}/admin/campaigns/${parsed.data.campaign_id}/edit`);
  return { error: null };
}

export async function updateSkuAction(
  _prev: ChildActionState,
  formData: FormData,
): Promise<ChildActionState> {
  const actor = await requireAdmin();
  const locale = await getLocale();

  const parsed = updateSkuSchema.safeParse({
    id: formData.get('id'),
    ...readSkuForm(formData),
  });
  if (!parsed.success) return { error: 'unknown' };

  const admin = createAdminSupabase();
  const { error } = await admin
    .from('skus')
    .update({
      name_i18n: parsed.data.name_i18n,
      unit_i18n: parsed.data.unit_i18n,
      target: parsed.data.target,
      stock_allocated: parsed.data.stock_allocated,
      active: parsed.data.active,
    })
    .eq('id', parsed.data.id);

  if (error) {
    const isDup = isUniqueViolation(error.message);
    if (!isDup) {
      logError('updateSkuAction failed', {
        actor_id: actor.id,
        sku_id: parsed.data.id,
        campaign_id: parsed.data.campaign_id,
        code: error.code,
        message: error.message,
      });
    }
    return { error: isDup ? 'duplicate' : 'unknown' };
  }

  await logAuditEvent({
    actor_id: actor.id,
    action: 'admin.sku_updated',
    entity: 'sku',
    entity_id: parsed.data.id,
    after: parsed.data,
  });

  revalidatePath(`/${locale}/admin/campaigns/${parsed.data.campaign_id}/edit`);
  return { error: null };
}

export async function deleteSkuAction(
  _prev: ChildActionState,
  formData: FormData,
): Promise<ChildActionState> {
  const actor = await requireAdmin();
  const locale = await getLocale();

  const parsed = deleteSkuSchema.safeParse({
    id: formData.get('id'),
    campaign_id: formData.get('campaign_id'),
  });
  if (!parsed.success) return { error: 'unknown' };

  const admin = createAdminSupabase();
  const { error } = await admin.from('skus').delete().eq('id', parsed.data.id);
  if (error) {
    logError('deleteSkuAction failed', {
      actor_id: actor.id,
      sku_id: parsed.data.id,
      campaign_id: parsed.data.campaign_id,
      code: error.code,
      message: error.message,
    });
    return { error: 'unknown' };
  }

  await logAuditEvent({
    actor_id: actor.id,
    action: 'admin.sku_deleted',
    entity: 'sku',
    entity_id: parsed.data.id,
  });

  revalidatePath(`/${locale}/admin/campaigns/${parsed.data.campaign_id}/edit`);
  return { error: null };
}
