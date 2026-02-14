# Simplify Email Scheduling Design

**Goal:** Replace the `EmailSchedule` table with a stateless cron approach that computes send eligibility at runtime, using a single column on `SharedSchedule` to prevent duplicate sends.

**Architecture:** The cron job queries trips directly instead of polling a separate scheduling table. Smart send-time logic (5 AM default, 7 PM night-before fallback for early departures) is preserved as a pure function called at runtime. One nullable `flightDayEmailSentAt` column on `SharedSchedule` tracks whether the email has been sent.

---

## What to Remove

- `EmailSchedule` model from `prisma/schema.prisma`
- Migration `prisma/migrations/20260119233303_add_email_schedule/`
- `src/lib/email/scheduler.ts` — the entire CRUD module (`scheduleFlightDayEmail`, `getPendingEmails`, `markEmailSent`, `markEmailFailed`, `cancelScheduledEmail`, `userHasEmailNotifications`)
- `src/lib/email/__tests__/scheduler.test.ts`
- The `waitUntil()` email scheduling call in `src/app/api/trips/route.ts`
- `emailSchedules` relation fields on `User` and `SharedSchedule` models

## What to Add

### Schema Change

Add to `SharedSchedule`:

```prisma
flightDayEmailSentAt DateTime?
```

New migration to add the column (and drop the `EmailSchedule` table in the same migration).

### Pure Utility Function

Keep `calculateEmailSendTime()` as a pure function (no DB calls). Move it from `scheduler.ts` to a small utility file, or inline it in the cron route if it's the only caller.

**Signature stays the same:**

```typescript
function calculateEmailSendTime(
  departureDatetime: string,
  originTz: string,
  firstInterventionTime?: string
): { sendAt: Date; isNightBefore: boolean };
```

### Rewritten Cron Logic

```
GET /api/cron/send-emails (every 15 minutes via Vercel Cron)

1. Check ENABLE_FLIGHT_DAY_EMAILS feature flag
2. Verify CRON_SECRET (timing-safe comparison)
3. Query SharedSchedule WHERE:
   - userId IS NOT NULL
   - user.emailNotifications = true
   - flightDayEmailSentAt IS NULL
   - departureDatetime is within next ~36 hours
4. For each trip:
   a. Parse schedule JSON, find flight day, get first intervention time
   b. Call calculateEmailSendTime(departure, originTz, firstIntervention)
   c. If sendAt <= now → send email, set flightDayEmailSentAt = now
   d. If sendAt > now → skip (not due yet)
5. Return { processed, sent, failed }
```

## What Stays Unchanged

- `src/lib/email/client.ts` — Resend wrapper with PII masking
- `src/lib/email/templates/flight-day.tsx` — React Email template (HTML + plain text)
- `src/lib/intervention-formatter.ts` — Shared formatting for web/email/calendar
- Cron auth (CRON_SECRET, timing-safe comparison)
- Feature flag (ENABLE_FLIGHT_DAY_EMAILS)
- Vercel cron config in `vercel.json`
- `emailNotifications` boolean on `User` model

## Why This Is Better

| Concern            | Before (EmailSchedule)                               | After (stateless cron)                                            |
| ------------------ | ---------------------------------------------------- | ----------------------------------------------------------------- |
| Staleness          | Pre-computed send time goes stale if trip edited     | Computed fresh every run                                          |
| Complexity         | Separate table, model, CRUD module, scheduler tests  | One column, one query                                             |
| Orphaned records   | Need cleanup for deleted trips/users                 | Cascade delete handles it (column lives on trip)                  |
| Race conditions    | Possible duplicate scheduling on rapid trip creation | Single `flightDayEmailSentAt` null check                          |
| Future email types | `emailType` column supports it                       | Add more `sentAt` columns or a table when actually needed (YAGNI) |
