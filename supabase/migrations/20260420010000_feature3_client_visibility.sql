-- Feature 3 — Per-client promoter visibility toggles
-- D-040: per-tenant override mechanism. All defaults are false so the
-- D-019 / D-028 / D-033 aggregates-only posture stays the default for every
-- existing tenant. Admin must explicitly flip a flag to open the surface.
-- Additive migration; IF NOT EXISTS so it is safe to re-run.

alter table public.clients
  add column if not exists show_promoter_names        boolean not null default false,
  add column if not exists show_promoter_photos       boolean not null default false,
  add column if not exists show_promoter_alerts       boolean not null default false,
  add column if not exists show_promoter_full_profile boolean not null default false;

comment on column public.clients.show_promoter_names        is 'D-040 override: when true the tenant sees promoter full names instead of display ids.';
comment on column public.clients.show_promoter_photos       is 'D-040 override: when true the tenant sees promoter photo URLs; default scrubs them.';
comment on column public.clients.show_promoter_alerts       is 'D-040 override: when true the tenant sees promoter alert rows; default excludes them.';
comment on column public.clients.show_promoter_full_profile is 'D-040 override: when true the tenant sees per-promoter rows; default aggregate-only.';
