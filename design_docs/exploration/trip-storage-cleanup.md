# Trip Storage Cleanup & Architecture

## Status

**Architecture: DONE** — All trips now live in the database with unified display.
**Cleanup: TODO** — No automated cleanup of anonymous/old trips yet.

---

## Implemented Architecture

**All trips live in the database.** localStorage is only used for form state before generation.

### Current Flow

1. User fills out trip form (stored in localStorage as draft)
2. User clicks "Generate" → POST to `/api/trips` → saves to DB, returns `tripId`
3. Redirect to `/trip/[id]` which loads from DB
4. Share button adds a `code` to existing trip record via `/api/trips/[id]/share`
5. `/s/[code]` displays same `TripScheduleView` component

### Key Files

- `src/app/api/trips/route.ts` — POST to create trip
- `src/app/api/trips/[id]/route.ts` — DELETE to remove trip
- `src/app/api/trips/[id]/share/route.ts` — POST to add share code
- `src/app/trip/[id]/page.tsx` — DB-backed trip view
- `src/components/trip-schedule-view.tsx` — Unified display component
- `src/lib/trip-utils.ts` — Shared mapping function

### Benefits Achieved

- Single schedule display component (`TripScheduleView`)
- Trips persist across devices for logged-in users
- Share links are just a public view of an existing trip
- Clean separation: form state (localStorage) vs saved trips (DB)
- Users can delete their own trips from `/history`

---

## TODO: Cleanup Strategy

Anonymous trips (`userId: null`) accumulate in the database. Need cleanup.

### For Anonymous Trips

```sql
-- Delete anonymous trips older than 48 hours
DELETE FROM "SharedSchedule"
WHERE "userId" IS NULL
AND "createdAt" < NOW() - INTERVAL '48 hours';
```

Run via:

- Vercel Cron (if on Pro plan)
- External cron service hitting `/api/cron/cleanup`
- Manual periodic cleanup

### For Old User Trips

Consider cleanup for trips that:

- Haven't been viewed in 6+ months
- Have 0 views and are 30+ days old
- User has 50+ trips (keep most recent N)

Or: never auto-delete, let users manage their own trips via `/history`.

### Implementation Options

1. **Vercel Cron** — Add `vercel.json` cron config, create `/api/cron/cleanup` endpoint
2. **External service** — Use cron-job.org or similar to hit cleanup endpoint
3. **On-demand** — Clean up when user creates new trip (lazy cleanup)

---

## Open Questions

- How long to keep anonymous trips? (48h? 7 days?)
- Rate limiting for anonymous trip creation (prevent abuse)?
- Should shared trips ever expire?
- Notify users before deleting old trips?
