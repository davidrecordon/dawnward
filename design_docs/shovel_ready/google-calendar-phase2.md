# Google Calendar Integration - Phase 2

## Summary

Infrastructure is ~90% complete. Review found **1 required fix** (multi-leg timezone) and **6 bugs** to address before enabling.

## Decisions

- **Auth flow**: Keep re-auth approach (request calendar scope only when user clicks "Add to Calendar")
- **Multi-leg trips**: Fix to use per-intervention timezone
- **Testing**: Manual testing only (existing unit tests are sufficient)
- **Scope**: Fix all identified bugs before enabling

---

## Required Fix: Multi-Leg Timezone Handling

**Problem:** `createEventsForSchedule()` uses single trip-wide `destTz` instead of per-intervention timezone. For multi-leg trips (e.g., SFO → NRT → SYD), all events would incorrectly use Sydney timezone.

**Solution:** Use `intervention.dest_tz` (already populated by Python scheduler) instead of trip-wide timezone.

### Files to Modify

| File                                        | Change                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/lib/google-calendar.ts`                | Remove `timezone` param from `buildCalendarEvent()`, extract from `anchor.dest_tz` |
| `src/lib/google-calendar.ts`                | Remove `destTz` param from `createEventsForSchedule()`                             |
| `src/app/api/calendar/sync/route.ts`        | Remove `trip.destTz` argument (line 101-105)                                       |
| `src/app/api/trips/[id]/actuals/route.ts`   | Remove `sync.trip.destTz` argument (line 62-66)                                    |
| `src/lib/__tests__/google-calendar.test.ts` | Update 10 test calls, add 2 new tests                                              |

---

## Bugs Found

### Critical (Fix Before Launch)

| #   | Issue                                                                                    | Location                   | Fix                                                               |
| --- | ---------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------- |
| 1   | **Token refresh failure** - Sync proceeds with invalid token after refresh fails         | `auth.config.ts`           | Check `token.error` in session callback, clear `hasCalendarScope` |
| 2   | **Partial deletion creates duplicates** - If some deletes fail, old + new events coexist | `google-calendar.ts`       | Use `Promise.allSettled()`, fail sync if deletions fail           |
| 3   | **Race condition** - Double-click creates duplicate events                               | `calendar-sync-button.tsx` | Add AbortController to cancel in-flight requests                  |

### Important (Should Fix)

| #   | Issue                                                                               | Location                              | Fix                                                        |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------- |
| 4   | **Missing JWT type field** - `error` field not in TypeScript types                  | `next-auth.d.ts`                      | Add `error?: string` to JWT interface                      |
| 5   | **Partial success reported as success** - User sees "Success" even if events failed | `google-calendar.ts`, `sync/route.ts` | Return `{ created, failed }`, return 207 status if partial |
| 6   | **Stale session after re-auth** - Button doesn't update after OAuth                 | `calendar-sync-button.tsx`            | Use `useSession()` hook, refresh after callback            |

---

## Implementation Plan

### Step 1: Multi-leg Timezone Fix

**`src/lib/google-calendar.ts`**

```typescript
// BEFORE (buildCalendarEvent)
export function buildCalendarEvent(
  interventions: Intervention[],
  date: string,
  timezone: string // Remove this
): calendar_v3.Schema$Event;

// AFTER
export function buildCalendarEvent(
  interventions: Intervention[],
  date: string
): calendar_v3.Schema$Event {
  // ... existing code ...
  const anchor = getAnchorIntervention(interventions);

  // NEW: Extract timezone from intervention
  const timezone = anchor.dest_tz;
  if (!timezone) {
    throw new Error("Intervention missing dest_tz field");
  }
  // ... rest unchanged, still uses timezone variable ...
}
```

```typescript
// BEFORE (createEventsForSchedule)
export async function createEventsForSchedule(
  accessToken: string,
  interventionDays: DaySchedule[],
  destTz: string // Remove this
): Promise<string[]>;

// AFTER
export async function createEventsForSchedule(
  accessToken: string,
  interventionDays: DaySchedule[]
): Promise<string[]> {
  // ... in loop ...
  const event = buildCalendarEvent(interventions, day.date); // No timezone arg
  // ...
}
```

### Step 2: Token Refresh Error Handling (Bug #1)

**`src/types/next-auth.d.ts`**

```typescript
declare module "next-auth/jwt" {
  interface JWT {
    // ... existing fields ...
    error?: string; // ADD THIS
  }
}
```

**`src/auth.config.ts`**

```typescript
async session({ session, token }) {
  if (session.user && token.id) {
    session.user.id = token.id as string;
  }
  // NEW: Clear calendar scope on refresh failure
  if (token.error === "RefreshAccessTokenError") {
    session.hasCalendarScope = false;
    return session;
  }
  // ... rest unchanged ...
}
```

### Step 3: Prevent Duplicate Events on Deletion Failure (Bug #2)

**`src/lib/google-calendar.ts`**

```typescript
export async function deleteCalendarEvents(
  accessToken: string,
  eventIds: string[]
): Promise<{ deleted: string[]; failed: string[] }> {
  const results = await Promise.allSettled(
    eventIds.map((id) => deleteCalendarEvent(accessToken, id))
  );

  const deleted: string[] = [];
  const failed: string[] = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      deleted.push(eventIds[index]);
    } else {
      failed.push(eventIds[index]);
    }
  });

  return { deleted, failed };
}
```

**`src/app/api/calendar/sync/route.ts`**

```typescript
if (existingSync && existingSync.googleEventIds.length > 0) {
  const { failed } = await deleteCalendarEvents(
    session.accessToken,
    existingSync.googleEventIds
  );
  if (failed.length > 0) {
    return NextResponse.json(
      {
        error: `Failed to delete ${failed.length} old events. Please remove manually and retry.`,
      },
      { status: 500 }
    );
  }
}
```

### Step 4: Prevent Double-Submit Race Condition (Bug #3)

**`src/components/calendar-sync-button.tsx`**

```typescript
const abortControllerRef = useRef<AbortController | null>(null);

const handleSync = async () => {
  // Cancel any in-flight request
  if (abortControllerRef.current) {
    abortControllerRef.current.abort();
  }

  // ... existing auth checks ...

  abortControllerRef.current = new AbortController();
  setIsLoading(true);
  setError(null);

  try {
    const response = await fetch("/api/calendar/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tripId }),
      signal: abortControllerRef.current.signal,
    });
    // ... rest unchanged ...
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return;
    setError(err instanceof Error ? err.message : "Failed to sync");
  } finally {
    setIsLoading(false);
    abortControllerRef.current = null;
  }
};
```

### Step 5: Report Partial Creation Failures (Bug #5)

**`src/lib/google-calendar.ts`**

```typescript
export async function createEventsForSchedule(
  accessToken: string,
  interventionDays: DaySchedule[]
): Promise<{ created: string[]; failed: number }> {
  const createdEventIds: string[] = [];
  let failedCount = 0;

  for (const day of interventionDays) {
    // ... existing loop ...
    try {
      const event = buildCalendarEvent(interventions, day.date);
      const eventId = await createCalendarEvent(accessToken, event);
      createdEventIds.push(eventId);
    } catch (error) {
      console.error("Error creating calendar event:", error);
      failedCount++;
    }
  }

  return { created: createdEventIds, failed: failedCount };
}
```

**`src/app/api/calendar/sync/route.ts`**

```typescript
const { created, failed } = await createEventsForSchedule(
  session.accessToken,
  schedule.interventions
);

// Save sync record with created IDs
// ...

if (failed > 0) {
  return NextResponse.json(
    {
      success: true,
      eventsCreated: created.length,
      eventsFailed: failed,
      warning: `${failed} events failed to create`,
    },
    { status: 207 }
  );
}

return NextResponse.json({
  success: true,
  eventsCreated: created.length,
});
```

### Step 6: Fix Stale Session After Re-auth (Bug #6)

**`src/components/calendar-sync-button.tsx`**

```typescript
import { useSession } from "next-auth/react";

interface CalendarSyncButtonProps {
  tripId: string;
  // Remove isLoggedIn and hasCalendarScope props
}

export function CalendarSyncButton({ tripId }: CalendarSyncButtonProps) {
  const { data: session, update: updateSession } = useSession();
  const isLoggedIn = !!session?.user;
  const hasCalendarScope = session?.hasCalendarScope ?? false;

  // Refresh session after OAuth callback
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("callbackUrl")) {
      updateSession();
    }
  }, [updateSession]);

  // ... rest unchanged ...
}
```

### Step 7: Enable & Test

1. Set `NEXT_PUBLIC_FEATURE_CALENDAR_SYNC=true` in `.env.local`
2. Manual tests:
   - Create trip → Sync to calendar → Verify events in Google Calendar
   - Re-sync → Verify old events deleted, new events created
   - Remove from calendar → Verify events deleted
   - New user clicks "Add to Calendar" → OAuth flow → Events created

---

## Verification

```bash
bun run typecheck    # TypeScript passes
bun run test:run     # All tests pass
bun run lint         # No lint errors
bun dev              # Start dev server for manual testing
```

---

## Files Summary

| File                                        | Changes                                                |
| ------------------------------------------- | ------------------------------------------------------ |
| `src/lib/google-calendar.ts`                | Multi-leg fix, deletion handling, creation return type |
| `src/app/api/calendar/sync/route.ts`        | Multi-leg fix, error handling improvements             |
| `src/app/api/trips/[id]/actuals/route.ts`   | Multi-leg fix                                          |
| `src/components/calendar-sync-button.tsx`   | Race condition fix, session refresh                    |
| `src/auth.config.ts`                        | Token error handling                                   |
| `src/types/next-auth.d.ts`                  | Add error field to JWT type                            |
| `src/lib/__tests__/google-calendar.test.ts` | Update tests, add multi-leg tests                      |
