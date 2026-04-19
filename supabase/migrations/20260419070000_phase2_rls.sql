-- Phase 2 — RLS policies for all Phase 2 tables.
-- Helpers (already exist):
--   public.is_admin()             — admin bypass
--   public.current_role()         — role of caller
--   public.current_client_id()    — caller's client_id (NULL for non-client roles)
--   public.current_user_locations() — caller's set of active assignment locations
--
-- Pattern:
--   admin → full CRUD
--   client → SELECT only on their tenant's data (no writes)
--   supervisor/promoter → SELECT only on data reachable via their assignments
--                         (locations they're assigned to, plus the campaigns
--                          and SKUs that touch those locations)
-- No USING (true) anywhere.

-- ============================================================================
-- clients
-- ============================================================================
create policy clients_select_admin
  on public.clients for select to authenticated
  using (public.is_admin());

create policy clients_select_self_tenant
  on public.clients for select to authenticated
  using (id = public.current_client_id());

create policy clients_insert_admin
  on public.clients for insert to authenticated
  with check (public.is_admin());

create policy clients_update_admin
  on public.clients for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy clients_delete_admin
  on public.clients for delete to authenticated
  using (public.is_admin());

-- ============================================================================
-- regions / cities — global reference data; readable by all signed-in users.
-- Writes restricted to admin.
-- ============================================================================
create policy regions_select_authenticated
  on public.regions for select to authenticated
  using (active = true or public.is_admin());

create policy regions_insert_admin on public.regions for insert to authenticated
  with check (public.is_admin());
create policy regions_update_admin on public.regions for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy regions_delete_admin on public.regions for delete to authenticated
  using (public.is_admin());

create policy cities_select_authenticated
  on public.cities for select to authenticated
  using (active = true or public.is_admin());

create policy cities_insert_admin on public.cities for insert to authenticated
  with check (public.is_admin());
create policy cities_update_admin on public.cities for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy cities_delete_admin on public.cities for delete to authenticated
  using (public.is_admin());

-- ============================================================================
-- locations
--   admin: all
--   supervisor/promoter: SELECT locations they're assigned to
--   client: SELECT locations that host one of their campaigns
-- ============================================================================
create policy locations_select_admin
  on public.locations for select to authenticated
  using (public.is_admin());

create policy locations_select_assigned
  on public.locations for select to authenticated
  using (id = any (public.current_user_locations()));

create policy locations_select_client_tenant
  on public.locations for select to authenticated
  using (
    public.current_client_id() is not null
    and exists (
      select 1
      from public.campaign_locations cl
      join public.campaigns c on c.id = cl.campaign_id
      where cl.location_id = locations.id
        and c.client_id = public.current_client_id()
    )
  );

create policy locations_insert_admin on public.locations for insert to authenticated
  with check (public.is_admin());
create policy locations_update_admin on public.locations for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy locations_delete_admin on public.locations for delete to authenticated
  using (public.is_admin());

-- ============================================================================
-- campaigns
--   admin: all
--   client: SELECT their own tenant's campaigns
--   supervisor/promoter: SELECT campaigns that touch their assigned locations
-- ============================================================================
create policy campaigns_select_admin
  on public.campaigns for select to authenticated
  using (public.is_admin());

create policy campaigns_select_client_tenant
  on public.campaigns for select to authenticated
  using (
    public.current_client_id() is not null
    and client_id = public.current_client_id()
  );

create policy campaigns_select_assigned
  on public.campaigns for select to authenticated
  using (
    exists (
      select 1
      from public.campaign_locations cl
      where cl.campaign_id = campaigns.id
        and cl.location_id = any (public.current_user_locations())
    )
  );

create policy campaigns_insert_admin on public.campaigns for insert to authenticated
  with check (public.is_admin());
create policy campaigns_update_admin on public.campaigns for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy campaigns_delete_admin on public.campaigns for delete to authenticated
  using (public.is_admin());

-- ============================================================================
-- campaign_locations — visible if either side is visible.
-- ============================================================================
create policy campaign_locations_select_admin
  on public.campaign_locations for select to authenticated
  using (public.is_admin());

create policy campaign_locations_select_client_tenant
  on public.campaign_locations for select to authenticated
  using (
    public.current_client_id() is not null
    and exists (
      select 1 from public.campaigns c
      where c.id = campaign_locations.campaign_id
        and c.client_id = public.current_client_id()
    )
  );

create policy campaign_locations_select_assigned
  on public.campaign_locations for select to authenticated
  using (location_id = any (public.current_user_locations()));

create policy campaign_locations_insert_admin
  on public.campaign_locations for insert to authenticated
  with check (public.is_admin());
create policy campaign_locations_delete_admin
  on public.campaign_locations for delete to authenticated
  using (public.is_admin());

-- ============================================================================
-- skus
--   client: SELECT their own tenant's SKUs (via campaign join)
--   supervisor/promoter: SELECT SKUs of campaigns touching their locations
-- ============================================================================
create policy skus_select_admin
  on public.skus for select to authenticated
  using (public.is_admin());

create policy skus_select_client_tenant
  on public.skus for select to authenticated
  using (
    public.current_client_id() is not null
    and exists (
      select 1 from public.campaigns c
      where c.id = skus.campaign_id
        and c.client_id = public.current_client_id()
    )
  );

create policy skus_select_assigned
  on public.skus for select to authenticated
  using (
    exists (
      select 1
      from public.campaign_locations cl
      where cl.campaign_id = skus.campaign_id
        and cl.location_id = any (public.current_user_locations())
    )
  );

create policy skus_insert_admin on public.skus for insert to authenticated
  with check (public.is_admin());
create policy skus_update_admin on public.skus for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy skus_delete_admin on public.skus for delete to authenticated
  using (public.is_admin());

-- ============================================================================
-- shifts
--   client: SELECT shifts of their own campaigns
--   supervisor/promoter: SELECT shifts at their assigned locations
-- ============================================================================
create policy shifts_select_admin
  on public.shifts for select to authenticated
  using (public.is_admin());

create policy shifts_select_client_tenant
  on public.shifts for select to authenticated
  using (
    public.current_client_id() is not null
    and exists (
      select 1 from public.campaigns c
      where c.id = shifts.campaign_id
        and c.client_id = public.current_client_id()
    )
  );

create policy shifts_select_assigned
  on public.shifts for select to authenticated
  using (location_id = any (public.current_user_locations()));

create policy shifts_insert_admin on public.shifts for insert to authenticated
  with check (public.is_admin());
create policy shifts_update_admin on public.shifts for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy shifts_delete_admin on public.shifts for delete to authenticated
  using (public.is_admin());

-- ============================================================================
-- user_assignments
--   admin: all
--   user themselves: SELECT their own assignments
--   (no client policy: clients don't see staffing)
-- ============================================================================
create policy user_assignments_select_admin
  on public.user_assignments for select to authenticated
  using (public.is_admin());

create policy user_assignments_select_self
  on public.user_assignments for select to authenticated
  using (user_id = auth.uid());

create policy user_assignments_insert_admin on public.user_assignments for insert to authenticated
  with check (public.is_admin());
create policy user_assignments_update_admin on public.user_assignments for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy user_assignments_delete_admin on public.user_assignments for delete to authenticated
  using (public.is_admin());
