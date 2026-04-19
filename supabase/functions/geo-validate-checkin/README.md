# geo-validate-checkin

Server-side trust boundary for promoter check-in. Validates geofence, strips
EXIF from the selfie, writes the `attendance` row, fires `alerts`.

## Deploy

```bash
# Link once per environment.
supabase link --project-ref <PROJECT_REF>

# Deploy this function (and only this function).
supabase functions deploy geo-validate-checkin

# The function runs with verify_jwt = true by default; the caller must send
# an 'Authorization: Bearer <user-jwt>' header obtained via Supabase Auth.
```

### Required environment variables

Supabase sets these automatically for deployed functions. For local
development (`supabase functions serve`), `.env.local` under
`supabase/functions/geo-validate-checkin/` must define:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Request contract

`POST /functions/v1/geo-validate-checkin`

`multipart/form-data`:

- `image`: the JPEG selfie. **image/jpeg only**; max 8 MiB.
- `metadata`: JSON string with:
  - `idempotency_key` (uuid v4)
  - `campaign_id` (uuid)
  - `location_id` (uuid)
  - `shift_id` (uuid | null)
  - `lat`, `lng` (numbers, WGS84 decimal degrees)
  - `captured_at` (ISO-8601 string from the device)

## Response

`200 OK`:
```json
{
  "attendance_id": "uuid",
  "status": "checked_in" | "late",
  "is_within_geofence": true,
  "distance_m": 12,
  "photo_path": "attendance/<user>/<date>/check_in_<idem>.jpg",
  "idempotency_key": "uuid",
  "replayed": false
}
```

`409` if the promoter already has an attendance row today at the same
(campaign, location). `replayed: true` if the idempotency key matched a prior
row — the client can treat this identically to a fresh success.

## Assumptions (Phase 3)

- Only **image/jpeg** accepted. Mobile cameras default to JPEG. PNG/WebP
  support would need separate metadata stripping (add in Phase 4+).
- **Asia/Amman timezone (UTC+3, no DST)** for combining shift times with the
  attendance date. See `SHIFT_TZ_OFFSET_MINUTES` in `index.ts`.
- **EXIF stripping is byte-level**, not a re-encode; image quality is
  preserved. All APPn markers and COM comments are removed. Only
  `DateTimeOriginal` + GPS lat/lon are parsed and stored in
  `attendance.check_in_exif_minimal`.

## Local verification (before first deploy)

```bash
supabase start
supabase functions serve geo-validate-checkin

# Exercise with curl (requires a real user JWT and an actual JPEG):
curl -X POST http://localhost:54321/functions/v1/geo-validate-checkin \
  -H "Authorization: Bearer $USER_JWT" \
  -F "image=@/path/to/selfie.jpg;type=image/jpeg" \
  -F 'metadata={"idempotency_key":"...","campaign_id":"...","location_id":"...","lat":31.95,"lng":35.91,"captured_at":"2026-04-20T09:05:00Z"}'
```

Expect a 200 response on the happy path, 403 when the caller isn't a
promoter assigned to the location, and 415 when the image isn't JPEG.
