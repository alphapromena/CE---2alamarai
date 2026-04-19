# supervisor-visit-create

Log a supervisor site visit — independent validation record. Shares the
trust-boundary shape of `geo-validate-checkin` (JWT verify, JPEG-only,
server-side EXIF strip, haversine distance, service-role write) but writes to
the `supervisor_visits` table and does NOT reject on geofence failure —
supervisors may deliberately stand outside the fence.

## Deploy

```bash
supabase functions deploy supervisor-visit-create
```

## Request

`POST /functions/v1/supervisor-visit-create`

`multipart/form-data`:

- `image`: JPEG selfie or site photo. image/jpeg only; max 8 MiB.
- `metadata`: JSON string with:
  - `idempotency_key` (uuid v4)
  - `campaign_id` (uuid)
  - `location_id` (uuid)
  - `lat`, `lng` (numbers, WGS84)
  - `captured_at` (ISO-8601)
  - `outcome`: one of `ok | issue_found | coaching | other`
  - `notes` (optional string, ≤ 2000 chars)

## Response

`200 OK`:
```json
{
  "visit_id": "uuid",
  "is_within_geofence": true,
  "distance_m": 18,
  "photo_path": "visits/<supervisor>/<date>/<idem>.jpg",
  "outcome": "ok",
  "idempotency_key": "uuid",
  "replayed": false
}
```

`403` when the caller isn't a supervisor assigned to the location.
`400` when the (campaign, location) pair isn't linked.
`replayed: true` when the idempotency key matched a prior row.
