'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { updateProfileAsAdmin, type ProfileAdminPatch } from '@/lib/supabase/admin-helpers';
import { requireAdmin } from '@/lib/auth/guards';
import { logAuditEvent } from '@/lib/auth/audit';
import { logError } from '@/lib/observability/logger';
import { parseCsv } from '@/lib/imports/parse';
import {
  productRowSchema,
  promoterRowSchema,
  locationRowSchema,
  firstIssueMessage,
} from '@/lib/imports/schemas';
import { isImportTarget, type ImportTarget } from '@/lib/imports/templates';
import type { BulkImportState, RowFailure } from './state';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const TEMP_PROMOTER_PASSWORD = 'Demo@1234';

const REVALIDATE_PATH: Record<ImportTarget, string> = {
  products: '/admin/campaigns',
  promoters: '/admin/users',
  locations: '/admin/locations',
};

export async function bulkImportAction(
  _prev: BulkImportState,
  formData: FormData,
): Promise<BulkImportState> {
  const actor = await requireAdmin();
  const locale = await getLocale();

  const target = formData.get('target');
  if (!isImportTarget(target)) {
    return { kind: 'error', error: 'unknown_target' };
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { kind: 'error', error: 'no_file' };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { kind: 'error', error: 'file_too_large' };
  }
  // Browsers sometimes leave .name set but type empty; rely on extension as
  // the authoritative check (the MIME guess is unreliable across OSes).
  if (!file.name.toLowerCase().endsWith('.csv')) {
    return { kind: 'error', error: 'invalid_type' };
  }

  const text = await file.text();
  const { rows, parseError } = parseCsv(text);
  if (parseError) {
    return { kind: 'error', error: 'parse_failed' };
  }
  if (rows.length === 0) {
    return { kind: 'error', error: 'no_rows' };
  }

  const admin = createAdminSupabase();
  const failedRows: RowFailure[] = [];
  let successCount = 0;

  for (let i = 0; i < rows.length; i++) {
    // Row number shown to users includes the header row (so the first data
    // row is "row 2" — what they see when they open the CSV in a spreadsheet).
    const rowNumber = i + 2;
    const raw = rows[i]!;

    try {
      if (target === 'products') {
        const parsed = productRowSchema.safeParse(raw);
        if (!parsed.success) {
          failedRows.push({ row: rowNumber, error: firstIssueMessage(parsed.error) });
          continue;
        }
        const { error } = await admin.from('skus').insert(parsed.data);
        if (error) {
          failedRows.push({ row: rowNumber, error: error.message });
          continue;
        }
        successCount++;
      } else if (target === 'locations') {
        const parsed = locationRowSchema.safeParse(raw);
        if (!parsed.success) {
          failedRows.push({ row: rowNumber, error: firstIssueMessage(parsed.error) });
          continue;
        }
        const { error } = await admin.from('locations').insert({
          city_id: parsed.data.city_id,
          name_i18n: parsed.data.name_i18n,
          address: parsed.data.address ?? null,
          lat: parsed.data.lat,
          lng: parsed.data.lng,
          geofence_radius_m: parsed.data.geofence_radius_m,
          active: true,
        });
        if (error) {
          failedRows.push({ row: rowNumber, error: error.message });
          continue;
        }
        successCount++;
      } else {
        // promoters
        const parsed = promoterRowSchema.safeParse(raw);
        if (!parsed.success) {
          failedRows.push({ row: rowNumber, error: firstIssueMessage(parsed.error) });
          continue;
        }
        const { data, error } = await admin.auth.admin.createUser({
          email: parsed.data.email,
          password: TEMP_PROMOTER_PASSWORD,
          email_confirm: true,
          user_metadata: {
            full_name: parsed.data.full_name,
            role: 'promoter',
            preferred_language: parsed.data.preferred_language,
            invited_by: actor.id,
          },
        });
        if (error || !data.user) {
          const duplicate = /already registered|already been registered|exists/i.test(
            error?.message ?? '',
          );
          failedRows.push({
            row: rowNumber,
            error: duplicate ? 'email already registered' : (error?.message ?? 'unknown error'),
          });
          continue;
        }
        // The handle_new_user trigger materialises the profile from
        // user_metadata; flip the temp-password flag and stamp the inviter.
        // D-044/D-046: this UPDATE must go through updateProfileAsAdmin
        // (SSR client). The previous implementation used the service-role
        // admin client, which the profiles_self_update_guard_trg rejected
        // every time — every bulk-imported user landed with created_by=NULL
        // and must_change_password=false. (SEC-01.)
        const profileUpdate: ProfileAdminPatch = {
          must_change_password: true,
          created_by: actor.id,
        };
        if (parsed.data.phone) profileUpdate.phone = parsed.data.phone;
        const { error: updateError } = await updateProfileAsAdmin(
          data.user.id,
          profileUpdate,
        );
        if (updateError) {
          // The user exists; surface the partial failure to the admin so they
          // can manually flip the flag if they care.
          failedRows.push({
            row: rowNumber,
            error: `created but profile update failed: ${updateError.message}`,
          });
          continue;
        }
        successCount++;
      }
    } catch (err) {
      failedRows.push({
        row: rowNumber,
        error: err instanceof Error ? err.message : 'unknown error',
      });
    }
  }

  // Persist the per-run summary. Audit failure must not break the response.
  const { error: auditError } = await admin.from('import_audit').insert({
    admin_id: actor.id,
    target,
    success_count: successCount,
    fail_count: failedRows.length,
  });
  if (auditError) {
    logError('import_audit insert failed', {
      target,
      success_count: successCount,
      fail_count: failedRows.length,
      db_error: auditError.message,
    });
  }

  await logAuditEvent({
    actor_id: actor.id,
    action: 'admin.bulk_import',
    entity: 'import',
    after: {
      target,
      success_count: successCount,
      fail_count: failedRows.length,
    },
  });

  revalidatePath(`/${locale}${REVALIDATE_PATH[target]}`);

  return { kind: 'done', target, successCount, failedRows };
}

