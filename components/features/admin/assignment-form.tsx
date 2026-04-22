'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { AutoDismissAlert } from '@/components/ui/auto-dismiss-alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/datepicker';
import { Link } from '@/i18n/navigation';
import {
  createAssignmentAction,
  updateAssignmentAction,
  type AssignmentActionState,
} from '@/app/[locale]/admin/assignments/actions';
import type { AssignmentRow } from '@/lib/queries/assignments';
import { i18n } from '@/lib/validations/i18n';

export interface AssignmentFormProps {
  mode: 'create' | 'edit';
  initial?: AssignmentRow;
  users: { id: string; full_name: string; role: 'promoter' | 'supervisor' }[];
  locations: { id: string; name_i18n: { ar?: string; en?: string } }[];
  /** Pre-loaded shifts for the initial location, if known. */
  initialShifts?: {
    id: string;
    summary: string;
  }[];
  locale: string;
}

const initialState: AssignmentActionState = { error: null };

export function AssignmentForm({
  mode,
  initial,
  users,
  locations,
  initialShifts = [],
  locale,
}: AssignmentFormProps) {
  const t = useTranslations('Admin.assignments');
  const tCommon = useTranslations('Admin.common');

  const action = mode === 'create' ? createAssignmentAction : updateAssignmentAction;
  const [state, formAction, isPending] = useActionState(action, initialState);

  const initialUser = initial?.user_id ?? users[0]?.id ?? '';
  const initialLocation = initial?.location_id ?? locations[0]?.id ?? '';
  const initialUserRole = users.find((u) => u.id === initialUser)?.role ?? 'promoter';

  const [userId, setUserId] = useState(initialUser);
  const [locationId, setLocationId] = useState(initialLocation);
  const [shiftId, setShiftId] = useState(initial?.shift_id ?? '');
  const [roleScope, setRoleScope] = useState<'promoter' | 'supervisor'>(
    initial?.role_scope ?? initialUserRole,
  );
  const [startsOn, setStartsOn] = useState(initial?.starts_on ?? '');
  const [endsOn, setEndsOn] = useState(initial?.ends_on ?? '');
  const [active, setActive] = useState(initial?.active ?? true);

  // Default role_scope to the selected user's role when the user changes.
  // (Wrapped in a microtask to satisfy react-hooks/set-state-in-effect.)
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const u = users.find((x) => x.id === userId);
      if (u) setRoleScope(u.role);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, users]);

  // Reload shifts when the location changes (client-side fetch of /api/shifts-for-location).
  const [shifts, setShifts] = useState(initialShifts);
  const [shiftsLoading, setShiftsLoading] = useState(false);
  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;
    // setState calls are wrapped in microtasks/promises so they're not
    // synchronous in the effect body (react-hooks/set-state-in-effect).
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setShiftsLoading(true);
      return fetch(`/api/admin/shifts-for-location?location_id=${encodeURIComponent(locationId)}`)
        .then((r) => (r.ok ? r.json() : { shifts: [] }))
        .then((data: { shifts?: { id: string; summary: string }[] }) => {
          if (!cancelled) setShifts(data.shifts ?? []);
        })
        .catch(() => {
          if (!cancelled) setShifts([]);
        })
        .finally(() => {
          if (!cancelled) setShiftsLoading(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  const errorMessage = state.error
    ? tCommon(`errors.${state.error === 'duplicate' ? 'duplicate' : 'unknown'}`)
    : null;

  if (users.length === 0 || locations.length === 0) {
    return (
      <Alert variant="warning">{users.length === 0 ? t('no_users') : t('no_locations')}</Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {mode === 'edit' && initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="starts_on" value={startsOn} />
      <input type="hidden" name="ends_on" value={endsOn} />
      <input type="hidden" name="shift_id" value={shiftId} />

      {errorMessage ? <Alert variant="danger">{errorMessage}</Alert> : null}
      {mode === 'edit' && state.error === null && !isPending ? (
        <AutoDismissAlert variant="success">{tCommon('saved')}</AutoDismissAlert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="user_id" required>
            {t('form.user_label')}
          </Label>
          <Select
            id="user_id"
            name="user_id"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            required
            options={users.map((u) => ({ value: u.id, label: `${u.full_name} (${u.role})` }))}
          />
        </div>
        <div>
          <Label htmlFor="role_scope" required>
            {t('form.role_scope_label')}
          </Label>
          <Select
            id="role_scope"
            name="role_scope"
            value={roleScope}
            onChange={(e) => setRoleScope(e.target.value as 'promoter' | 'supervisor')}
            required
            options={[
              { value: 'promoter', label: t('form.role_scope_promoter') },
              { value: 'supervisor', label: t('form.role_scope_supervisor') },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="location_id" required>
            {t('form.location_label')}
          </Label>
          <Select
            id="location_id"
            name="location_id"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            required
            options={locations.map((l) => ({ value: l.id, label: i18n(l.name_i18n, locale) }))}
          />
        </div>
        <div>
          <Label htmlFor="shift_select">{t('form.shift_label')}</Label>
          <Select
            id="shift_select"
            value={shiftId}
            onChange={(e) => setShiftId(e.target.value)}
            disabled={shiftsLoading}
          >
            <option value="">{t('form.shift_any')}</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.summary}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-fg-muted">{t('form.shift_help')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="starts_on_picker">{t('form.starts_on_label')}</Label>
          <DatePicker id="starts_on_picker" value={startsOn} onChange={setStartsOn} />
        </div>
        <div>
          <Label htmlFor="ends_on_picker">{t('form.ends_on_label')}</Label>
          <DatePicker id="ends_on_picker" value={endsOn} onChange={setEndsOn} />
        </div>
      </div>

      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="focus:ring-accent/20 h-4 w-4 rounded border-border text-accent focus:ring-2"
        />
        <span>{t('form.active_label')}</span>
      </label>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-6">
        <Button asChild variant="ghost" type="button" disabled={isPending}>
          <Link href="/admin/assignments">{tCommon('back_to_list')}</Link>
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} /> : null}
          {mode === 'create'
            ? isPending
              ? tCommon('create_loading')
              : tCommon('create_cta')
            : isPending
              ? tCommon('save_loading')
              : tCommon('save_cta')}
        </Button>
      </div>
    </form>
  );
}
