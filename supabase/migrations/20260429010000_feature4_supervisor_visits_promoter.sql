-- Feature 4 — Link supervisor_visits to a specific promoter (D-041).
--
-- Existing Phase 3 supervisor_visits are keyed by supervisor + campaign +
-- location. To support the "your supervisor visited you today" notification
-- and per-promoter visit history, add a nullable promoter_id pointer.
-- Nullable at the column level so legacy rows (no promoter) are preserved;
-- new rows require promoter_id at the edge-function validation layer.
--
-- RLS: promoter can SELECT rows where promoter_id = auth.uid(). All other
-- policies (admin, supervisor self, supervisor by location) are untouched.
-- Client role still has no access.

alter table public.supervisor_visits
  add column if not exists promoter_id uuid
    references public.profiles (id) on delete set null;

comment on column public.supervisor_visits.promoter_id is 'Feature 4 / D-041: optional promoter tied to this visit; enables promoter notification + visit history.';

create index if not exists supervisor_visits_promoter_date_idx
  on public.supervisor_visits (promoter_id, visited_at desc)
  where promoter_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'supervisor_visits'
      and policyname = 'supervisor_visits_select_promoter_self'
  ) then
    create policy supervisor_visits_select_promoter_self
      on public.supervisor_visits for select to authenticated
      using (promoter_id = auth.uid());
  end if;
end$$;
