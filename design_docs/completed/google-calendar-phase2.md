# Google Calendar Integration - Phase 2

## Status: Completed

Phase 2 added background sync, improved error handling, and fixed multi-leg timezone issues. All bugs from the review have been addressed.

## Key Improvements

### Background Sync with `waitUntil()`

Sync now runs asynchronously using Vercel's `waitUntil()` function:

- POST `/api/calendar/sync` returns immediately with status "syncing"
- Client polls GET `/api/calendar/sync?tripId=X` for status updates
- Sync continues even if user closes the browser
- 5-minute stale timeout treats stuck syncs as failed

### Retry Logic

Transient errors (network, rate limit) retry with exponential backoff:

- Max 2 retries
- Base delay 1000ms, doubles each retry
- Non-retryable errors (token_revoked, calendar_not_found) fail immediately

### Error Classification

Errors are classified for appropriate client handling:

| Code | Meaning | Retryable | Client Action |
|------|---------|-----------|---------------|
| `token_revoked` | User revoked access in Google settings | No | Prompt re-auth |
| `rate_limit` | Google Calendar quota exceeded | Yes | Auto-retry |
| `network` | Connection/timeout error | Yes | Auto-retry |
| `calendar_not_found` | Calendar deleted | No | Show error |
| `unknown` | Unexpected error | No | Show error |

### CalendarSync Status Tracking

New database fields track sync progress:

```prisma
model CalendarSync {
  status        String    // "syncing" | "completed" | "failed"
  startedAt     DateTime? // For stale timeout detection
  eventsCreated Int?      // Count of successfully created events
  eventsFailed  Int?      // Count of failed events
  errorMessage  String?   // Human-readable error
  errorCode     String?   // Machine-readable code (token_revoked, etc.)
}
```

## Bugs Fixed

| # | Issue | Solution |
|---|-------|----------|
| 1 | Token refresh failure - sync proceeds with invalid token | Check `token.error` in session callback, clear `hasCalendarScope` |
| 2 | Partial deletion creates duplicates | Use `Promise.allSettled()`, continue sync, log failures |
| 3 | Race condition on double-click | AbortController cancels in-flight requests |
| 4 | Missing JWT type field | Added `error?: string` to JWT interface |
| 5 | Partial success reported as success | Return `{ created, failed }` counts, track in CalendarSync |
| 6 | Stale session after re-auth | Use `useSession()` hook, refresh after OAuth callback |
| 7 | Multi-leg trips use wrong timezone | Use per-intervention `dest_tz` instead of trip-wide |

## Security Fixes (Pre-Merge Review)

| Issue | Fix |
|-------|-----|
| Token in URL parameter for tokeninfo | Changed to POST with form body |
| OAuth response logging could leak tokens | Only log `error` and `error_description` |
| OAuth error logging could leak tokens | Sanitize error object before logging |

## API Routes

### POST /api/calendar/sync

Start background sync for a trip.

```json
// Request
{ "tripId": "clx..." }

// Response (immediate)
{
  "success": true,
  "status": "syncing",
  "message": "Calendar sync started"
}
```

### GET /api/calendar/sync?tripId=X

Check sync status (for polling).

```json
{
  "isSynced": true,
  "status": "completed",
  "lastSyncedAt": "2024-01-15T...",
  "eventCount": 12,
  "eventsCreated": 12,
  "eventsFailed": 0
}
```

### DELETE /api/calendar/sync?tripId=X

Remove all calendar events for a trip.

```json
{
  "success": true,
  "eventsDeleted": 12
}
```

## Files Modified

| File | Changes |
|------|---------|
| `src/app/api/calendar/sync/route.ts` | Background sync with `waitUntil()`, retry logic, status tracking |
| `src/app/api/calendar/verify/route.ts` | Verify token scopes with Google, POST for tokeninfo |
| `src/components/calendar-sync-button.tsx` | Polling for sync status, AbortController, useSession() |
| `src/lib/google-calendar.ts` | Per-intervention timezone, deletion handling, event grouping |
| `src/lib/token-refresh.ts` | Sanitized error logging |
| `src/auth.config.ts` | Token error handling in session callback, sanitized logging |
| `src/types/next-auth.d.ts` | Added `error` field to JWT type |
| `prisma/schema.prisma` | Added CalendarSync status tracking fields |

## Testing

Run all tests:
```bash
bun run typecheck    # TypeScript passes
bun run test:run     # All tests pass
bun run lint         # No lint errors
```

Manual testing:
1. New user clicks "Add to Calendar" - OAuth flow - Events created
2. Re-sync - Old events deleted, new events created
3. Remove from calendar - Events deleted
4. Close browser during sync - Events still created
5. Revoke access in Google settings - Prompt re-auth on next sync
