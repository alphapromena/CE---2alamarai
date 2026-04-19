-- Phase 5 — stock_balances: derived per-entity balance view.
--
-- Design choice (draft D-023): plain SQL view, NOT a materialized view.
--   - freshness is free; corrections (D-008) and distributions reflect
--     instantly without a refresh step
--   - materialized view refresh on every movement is a hot-path cost we don't
--     want during distribution or daily-report submission
--   - with composite indexes on stock_movements (campaign, sku, to_*) and
--     (campaign, sku, from_*), the view query is index-only and cheap
--   - Phase 7 may layer a nightly materialized read cache on top if
--     dashboards measure p95 > target; the view stays authoritative
--
-- SECURITY INVOKER: the view runs with the caller's privileges, so RLS on
-- stock_movements applies. This means the balance a caller sees includes
-- exactly the movements they are authorised to read. The Phase-5 stock_rls
-- migration grants supervisors visibility into their own movements AND those
-- touching their assigned promoters/locations, so their balance computations
-- are complete.
--
-- Columns:
--   campaign_id   uuid     — the campaign
--   sku_id        uuid     — the SKU
--   entity_type   enum     — warehouse | supervisor | promoter | location | consumer
--   entity_id     uuid     — profiles.id or locations.id; NULL for warehouse/consumer
--   total_in      integer  — Σ quantity on movements where to_entity = this
--   total_out     integer  — Σ quantity on movements where from_entity = this
--   balance       integer  — total_in − total_out (may be negative for consumer;
--                            the 'consumer' pseudo-entity acts as a sink)

create or replace view public.stock_balances
with (security_invoker = on)
as
with inflows as (
  select
    campaign_id,
    sku_id,
    to_entity_type   as entity_type,
    to_entity_id     as entity_id,
    sum(quantity)    as total_in
  from public.stock_movements
  group by campaign_id, sku_id, to_entity_type, to_entity_id
),
outflows as (
  select
    campaign_id,
    sku_id,
    from_entity_type as entity_type,
    from_entity_id   as entity_id,
    sum(quantity)    as total_out
  from public.stock_movements
  group by campaign_id, sku_id, from_entity_type, from_entity_id
)
select
  coalesce(i.campaign_id, o.campaign_id)     as campaign_id,
  coalesce(i.sku_id, o.sku_id)               as sku_id,
  coalesce(i.entity_type, o.entity_type)     as entity_type,
  coalesce(i.entity_id, o.entity_id)         as entity_id,
  coalesce(i.total_in,  0)                   as total_in,
  coalesce(o.total_out, 0)                   as total_out,
  coalesce(i.total_in, 0) - coalesce(o.total_out, 0) as balance
from inflows i
full outer join outflows o
  on  i.campaign_id = o.campaign_id
  and i.sku_id      = o.sku_id
  and i.entity_type = o.entity_type
  and i.entity_id is not distinct from o.entity_id;

comment on view public.stock_balances is
  'Per-(campaign, sku, entity) running balance derived from stock_movements. Plain view (D-023): freshness is free, refresh is not a hot-path cost.';

grant select on public.stock_balances to authenticated;
