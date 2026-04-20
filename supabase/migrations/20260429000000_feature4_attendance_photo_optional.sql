-- Feature 4 — Attendance photos become OPTIONAL (D-041).
--
-- Phase 3 introduced two CHECK constraints on public.attendance that required
-- check_in_photo_path / check_out_photo_path to be NOT NULL whenever the row
-- represented a real presence record (status <> 'absent' for check-in;
-- status in ('checked_out','early_leave') for check-out). Field reality
-- (mall photography restrictions, broken cameras, lighting, privacy) means
-- the photo cannot be treated as a hard requirement. Relaxed here so the
-- column stays but can be NULL.
--
-- All other invariants (time/lat/lng completeness, coord pairing,
-- check-out-after-check-in, status/override fields) are preserved byte-for-
-- byte against phase3_attendance.sql. Only the photo_path clauses are
-- removed from each constraint's predicate.

alter table public.attendance
  drop constraint if exists attendance_status_check_in_consistency,
  add constraint attendance_status_check_in_consistency check (
    (status = 'absent'
      and check_in_time is null
      and check_in_lat is null)
    or (status <> 'absent'
      and check_in_time is not null
      and check_in_lat is not null
      and check_in_lng is not null)
  );

alter table public.attendance
  drop constraint if exists attendance_status_check_out_consistency,
  add constraint attendance_status_check_out_consistency check (
    (status in ('checked_out', 'early_leave')
      and check_out_time is not null
      and check_out_lat is not null
      and check_out_lng is not null)
    or (status in ('checked_in', 'late', 'absent', 'missing_checkout')
      and check_out_time is null
      and check_out_lat is null
      and check_out_lng is null
      and check_out_photo_path is null)
  );

comment on constraint attendance_status_check_in_consistency on public.attendance is 'Feature 4 / D-041: photo_path relaxed to optional; time+lat+lng still required when status<>absent.';
comment on constraint attendance_status_check_out_consistency on public.attendance is 'Feature 4 / D-041: photo_path relaxed to optional on check_out; time+lat+lng still required for checked_out/early_leave.';
