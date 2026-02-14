# Dawnward Email Design Document

## Overview

Dawnward sends flight day reminder emails to help users follow their jet lag plan. Emails are sent via [Resend](https://resend.com) with [React Email](https://react.email) templates, triggered by a stateless Vercel cron job.

The system is opt-in: users enable `emailNotifications` in Settings, and a feature flag (`ENABLE_FLIGHT_DAY_EMAILS`) controls whether the cron processes anything at all.

---

## Architecture

### Stateless Cron

The cron runs every 15 minutes and computes everything at runtime. There is no separate scheduling table -- just a `flightDayEmailSentAt` column on `SharedSchedule` to prevent duplicate sends.

```
Vercel Cron (*/15 * * * *)
    │
    ▼
GET /api/cron/send-emails
    │
    ├── Check feature flag (ENABLE_FLIGHT_DAY_EMAILS)
    ├── Verify CRON_SECRET (timing-safe)
    │
    ├── Query SharedSchedule:
    │   - userId not null
    │   - flightDayEmailSentAt is null
    │   - currentScheduleJson exists
    │   - user.emailNotifications = true
    │
    ├── Filter: departure within 36 hours
    │
    └── For each trip:
        ├── calculateEmailSendTime() → skip if not due
        ├── Render HTML + plain text
        ├── Send via Resend
        └── Set flightDayEmailSentAt on success
```

### Why Stateless?

An earlier design used a separate `EmailSchedule` table with pre-computed send times, created via `waitUntil()` when trips were saved. This was replaced because:

- Pre-computed send times go stale if a trip is edited
- The scheduling table duplicated trip data
- `waitUntil()` added complexity to trip creation
- The cron can compute everything it needs from `SharedSchedule` directly

See `design_docs/completed/2026-02-14-simplify-email-scheduling-design.md` for the full decision record.

---

## Files

```
src/lib/email/
├── client.ts              # Resend API wrapper, PII masking
└── templates/
    └── flight-day.tsx     # React Email template (HTML + plain text)

src/lib/
└── intervention-formatter.ts  # Shared formatting for emails and UI

src/app/api/cron/send-emails/
├── route.ts               # Stateless cron endpoint
└── __tests__/route.test.ts
```

---

## Email Client

`src/lib/email/client.ts` wraps the Resend SDK:

- **`sendEmail(options)`** -- sends an email, returns `{ success, id?, error? }`
- **`maskEmail(email)`** -- masks PII for logging (`user@example.com` -> `u***r@example.com`)
- **`isEmailConfigured()`** -- checks if `RESEND_API_KEY` is set
- Sender address: `Dawnward <notifications@dawnward.app>`

---

## Send Time Calculation

`calculateEmailSendTime()` determines when to send the flight day email. It's a pure function with no database calls.

**Default:** 5:00 AM local time on departure day (origin timezone).

**Fallback:** 7:00 PM the night before, if less than 3 hours between the default 5 AM send time and the first scheduled intervention.

| Departure | First Intervention | Send Time             | Why                             |
| --------- | ------------------ | --------------------- | ------------------------------- |
| 10:00 AM  | 07:00 (wake)       | 05:00 AM same day     | 2h notice is sufficient         |
| 06:30 AM  | 05:30 (wake)       | 07:00 PM night before | Only 30min between 5AM and wake |
| 11:00 PM  | 07:00 (wake)       | 05:00 AM same day     | Late flight, plenty of time     |

The first intervention time is extracted from the schedule's flight day items (`day === 0`), using `origin_time` since the user is still at the origin.

Constants:

| Constant             | Value | Purpose                                 |
| -------------------- | ----- | --------------------------------------- |
| `DEFAULT_SEND_HOUR`  | 5     | Default send time (5 AM local)          |
| `MIN_HOURS_NOTICE`   | 3     | Minimum hours before first intervention |
| `FALLBACK_SEND_HOUR` | 19    | Fallback send time (7 PM night before)  |
| `LOOKAHEAD_HOURS`    | 36    | How far ahead to look for departures    |

---

## Flight Day Email Template

`src/lib/email/templates/flight-day.tsx` uses React Email components:

1. **Header** -- sky-blue banner with route label
2. **Greeting** -- personalized if user has a name
3. **Schedule** -- monospace pre-formatted schedule from `formatFlightDayForEmail()`
4. **Tips** -- three quick jet lag tips
5. **CTA** -- link to full schedule on dawnward.app
6. **Footer** -- unsubscribe link to Settings

The template renders to both HTML (via `renderFlightDayEmail()`) and plain text (via `renderFlightDayEmailText()`).

**Subject line format:** `[Today] Your jet lag plan for LAX → LHR` or `[Tomorrow] ...` for night-before sends.

---

## Shared Formatting

`src/lib/intervention-formatter.ts` provides formatting functions shared between the email template and the web UI's `DaySummaryCard`:

- **`getCondensedDescription(intervention)`** -- one-line summary, prefers `intervention.summary` (from Python scheduler), falls back to static descriptions
- **`getInterventionEmoji(type)`** -- emoji for each intervention type
- **`formatFlightDayForEmail()`** -- formats the full flight day schedule as plain text sections (Before Boarding, On the Plane, After Landing)
- **`formatDayForText()`** -- formats any day's interventions as plain text

---

## Database

Email state is tracked on `SharedSchedule` directly:

```prisma
model SharedSchedule {
  // ... existing fields ...
  flightDayEmailSentAt  DateTime?  // null = not sent, set after successful send
}

model User {
  // ... existing fields ...
  emailNotifications    Boolean    @default(false)  // opt-in
}
```

---

## Configuration

### Environment Variables

| Variable                   | Required | Purpose                                                    |
| -------------------------- | -------- | ---------------------------------------------------------- |
| `RESEND_API_KEY`           | Yes\*    | Resend API key for sending emails                          |
| `CRON_SECRET`              | Yes\*    | Authenticates cron job requests                            |
| `ENABLE_FLIGHT_DAY_EMAILS` | No       | Set to `"true"` to enable (default: off)                   |
| `NEXT_PUBLIC_APP_URL`      | No       | Base URL for email links (default: `https://dawnward.app`) |

\*Required only when email sending is enabled.

### Vercel Cron

Configured in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/send-emails",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

### Resend Setup

1. Create account at [resend.com](https://resend.com)
2. Verify domain (`dawnward.app`) for sending
3. Create API key with send permissions
4. Set `RESEND_API_KEY` in environment

---

## Security

- **Authentication**: Cron endpoint requires `Authorization: Bearer {CRON_SECRET}` with timing-safe comparison (`crypto.timingSafeEqual`)
- **PII**: Email addresses masked in all log output
- **Feature flag**: `ENABLE_FLIGHT_DAY_EMAILS` must be explicitly `"true"` -- any other value (including unset) disables sending
- **Opt-in**: Users must enable `emailNotifications` in Settings
- **No sensitive data in emails**: Emails contain schedule times and intervention types, not personal health data

---

## Testing

Tests in `src/app/api/cron/send-emails/__tests__/route.test.ts`:

- **`calculateEmailSendTime`** -- 4 tests covering default morning, night-before fallback, late departures, and missing intervention time
- **Feature flag** -- disabled and unset states return `skipped`
- **Authorization** -- missing secret (500), invalid token (401), valid token (200)
- **Email processing** -- successful send with `flightDayEmailSentAt` update, failed send, missing email, missing flight day schedule, outside lookahead window, render exceptions

Formatting tests in `src/lib/__tests__/intervention-formatter.test.ts`:

- Condensed descriptions with summary preference
- Emoji mapping for all intervention types
- Flight day email formatting with sections

---

## Future Considerations

The email infrastructure is designed to support additional email types:

1. **Adaptation day emails** -- daily schedule emails during the adaptation period
2. **Trip summary emails** -- post-trip summary of adherence
3. **Welcome email** -- sent on first sign-in
4. **Weekly digest** -- upcoming trips summary

Adding a new email type requires:

1. Create a new template in `src/lib/email/templates/`
2. Add sending logic to the cron route (or create a new cron endpoint)
3. Add a tracking column or expand the tracking approach as needed
4. Add user preference toggle if the email type should be independently opt-in
