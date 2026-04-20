import 'server-only';
import { createHash } from 'node:crypto';
import { createAdminSupabase } from '@/lib/supabase/admin';

/**
 * Per-client promoter-visibility flags (D-040). Four independent toggles the
 * admin flips per tenant. All-false preserves the D-019 / D-028 / D-033
 * aggregate-only posture; flipping one opens a narrow surface for that
 * tenant only.
 */
export type ClientVisibility = {
  show_promoter_names: boolean;
  show_promoter_photos: boolean;
  show_promoter_alerts: boolean;
  show_promoter_full_profile: boolean;
};

/** Safe default used when no client context is available. */
export const ZERO_VISIBILITY: ClientVisibility = Object.freeze({
  show_promoter_names: false,
  show_promoter_photos: false,
  show_promoter_alerts: false,
  show_promoter_full_profile: false,
}) as ClientVisibility;

/**
 * Load the visibility toggles for a single client. Returns ZERO_VISIBILITY
 * when the row is missing or the DB call fails so callers never accidentally
 * leak data on transient errors.
 */
export async function getClientVisibility(clientId: string): Promise<ClientVisibility> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('clients')
    .select(
      'show_promoter_names, show_promoter_photos, show_promoter_alerts, show_promoter_full_profile',
    )
    .eq('id', clientId)
    .maybeSingle();
  if (error || !data) return ZERO_VISIBILITY;
  return {
    show_promoter_names: !!data.show_promoter_names,
    show_promoter_photos: !!data.show_promoter_photos,
    show_promoter_alerts: !!data.show_promoter_alerts,
    show_promoter_full_profile: !!data.show_promoter_full_profile,
  };
}

/**
 * Stable, deterministic pseudonym for a promoter shown to clients whose
 * show_promoter_names flag is false. Format: 'P' + first 6 hex chars of the
 * sha256 of the uuid — ~16.7M distinct values, no mapping table required.
 */
export function promoterDisplayId(promoterId: string): string {
  const hex = createHash('sha256').update(promoterId).digest('hex');
  return `P${hex.slice(0, 6).toUpperCase()}`;
}

/**
 * Promoter fields a query / builder may expose. The scrub function below
 * takes an object of this shape plus the tenant's visibility flags and
 * returns a redacted copy per-flag.
 */
export type PromoterFields = {
  promoter_id: string;
  promoter_name: string | null;
  promoter_photo_url?: string | null;
  alerts?: unknown;
};

/**
 * Apply field-level scrubbing. Callers pass the raw promoter fields plus the
 * tenant's flags; we return a new object with fields redacted according to
 * the flags. Never mutates input.
 */
export function scrubPromoterFields<T extends PromoterFields>(
  row: T,
  visibility: ClientVisibility,
): T & { promoter_display_id: string } {
  const display = promoterDisplayId(row.promoter_id);
  const out = { ...row, promoter_display_id: display };
  if (!visibility.show_promoter_names) {
    out.promoter_name = null;
  }
  if (!visibility.show_promoter_photos && 'promoter_photo_url' in out) {
    out.promoter_photo_url = null;
  }
  if (!visibility.show_promoter_alerts && 'alerts' in out) {
    out.alerts = undefined;
  }
  return out;
}
