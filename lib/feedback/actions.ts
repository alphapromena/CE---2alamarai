'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { logAuditEvent } from '@/lib/auth/audit';
import { submitFeedbackSchema } from '@/lib/validations/feedback';
import { checkRateLimit } from '@/lib/rate-limit/check';

export type FeedbackActionState = { error: string | null; id?: string };

/**
 * Promoter submits consumer feedback. Idempotent on (promoter_user_id,
 * idempotency_key) per D-009. Optional competitor_mentions are inserted
 * atomically after the parent row.
 */
export async function submitFeedbackAction(
  input: unknown,
): Promise<FeedbackActionState> {
  const me = await requireRole('promoter', 'supervisor', 'admin');

  const rl = await checkRateLimit('feedback_submit', me.id);
  if (!rl.allowed) return { error: 'rate_limited' };

  const parsed = submitFeedbackSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid_input' };
  const body = parsed.data;

  const supabase = await createServerSupabase();

  // Idempotency read-through.
  const { data: existing } = await supabase
    .from('consumer_feedback')
    .select('id')
    .eq('promoter_user_id', me.id)
    .eq('idempotency_key', body.idempotency_key)
    .maybeSingle();
  if (existing) return { error: null, id: existing.id };

  const { data: inserted, error } = await supabase
    .from('consumer_feedback')
    .insert({
      campaign_id: body.campaign_id,
      location_id: body.location_id,
      promoter_user_id: me.id,
      daily_report_id: body.daily_report_id ?? null,
      supervisor_visit_id: body.supervisor_visit_id ?? null,
      category: body.category,
      sentiment: body.sentiment ?? null,
      body: body.body,
      idempotency_key: body.idempotency_key,
    })
    .select('id')
    .single();
  if (error || !inserted) return { error: 'insert_failed' };

  // Competitor mentions — insert with admin client so a partial failure here
  // doesn't require us to rollback the feedback row. If this succeeds the
  // parent is linked; if it fails, the row exists without competitors.
  if (body.competitors && body.competitors.length > 0) {
    const admin = createAdminSupabase();
    const rows = body.competitors.map((c) => ({
      feedback_id: inserted.id,
      brand: c.brand,
      context: c.context ?? null,
      sentiment: c.sentiment ?? null,
    }));
    await admin.from('competitor_mentions').insert(rows);
  }

  await logAuditEvent({
    actor_id: me.id,
    action: 'consumer_feedback.submit',
    entity: 'consumer_feedback',
    entity_id: inserted.id,
    after: {
      campaign_id: body.campaign_id,
      location_id: body.location_id,
      category: body.category,
      sentiment: body.sentiment ?? null,
      competitor_count: body.competitors?.length ?? 0,
    },
  });

  revalidatePath('/[locale]/promoter/feedback', 'page');
  revalidatePath('/[locale]/supervisor/feedback', 'page');
  return { error: null, id: inserted.id };
}
