# geo-validate-checkout

Mirror of `geo-validate-checkin` for the check-out leg. Validates ownership of
the attendance row, geofence, strips EXIF from the selfie, updates the row,
fires `alerts`.

## Deploy

```bash
supabase functions deploy geo-validate-checkout
```

Same env vars + auth contract as `geo-validate-checkin`.

## Request contract

`POST /functions/v1/geo-validate-checkout`

`multipart/form-data`:

- `image`: the JPEG selfie. image/jpeg only; max 8 MiB.
- `metadata`: JSON string with:
  - `idempotency_key` (uuid v4)
  - `attendance_id` (uuid) — the row created at check-in
  - `lat`, `lng` (numbers, WGS84 decimal degrees)
  - `captured_at` (ISO-8601)

## Response

`200 OK`:
```json
{
  "attendance_id": "uuid",
  "status": "checked_out" | "early_leave",
  "is_within_geofence": true,
  "distance_m": 12,
  "photo_path": "attendance/<user>/<date>/check_out_<idem>.jpg",
  "idempotency_key": "uuid",
  "replayed": false
}
```

`403` when the attendance row doesn't belong to the caller.
`409` when check-out already happened on this attendance row.
`replayed: true` when the same `idempotency_key` was already seen.
