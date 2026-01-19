# Dawnward: All Decisions

## Project Overview

**Dawnward** is a free, open-source jet lag optimization app. Uses the Arcascope circadian library (Forger99 model) to generate personalized schedules for adapting to new timezones via light exposure, melatonin timing, and caffeine strategy.

---

## Stack

| Layer           | Choice                                       |
| --------------- | -------------------------------------------- |
| Framework       | Next.js 16+ (App Router)                     |
| Hosting         | Vercel                                       |
| Auth            | NextAuth.js v5, Google only                  |
| Database        | Prisma Postgres                              |
| Python Runtime  | Vercel Python functions (accept cold starts) |
| Circadian Model | Arcascope library, Forger99 model            |
| Analytics       | Vercel Analytics                             |
| Repo            | GitHub, MIT license, private until MVP       |

---

## Domain

- **Target:** `dawnward.app` (check availability and register)
- Name confirmed clear of conflicts in jet lag/circadian space

---

## Core Features (v1)

### Trip Input

- **Manual entry only** — no flight lookup API
- **Timezone selection:** Airport code + city typeahead (search both datasets, airports first)
- **Airport data:** Curated JSON file (~500-1000 major airports), bundled client-side
- **Multi-leg trip support** — users can chain flights (SFO → NRT → SIN)

### Schedule Generation

- **Prep days:** 1-7 days, default 3, user-configurable per trip
- **Adaptive algorithm:** More prep days = gentler daily shifts
- **Intervention types:** `light_seek`, `light_avoid`, `melatonin`, `exercise`, `caffeine_ok`, `caffeine_cutoff`, `sleep_target`, `wake_target`, `nap_window`
- **Model version tracking** in schedules for future A/B testing

### Authentication

- **Google only** via NextAuth.js v5
- **Phase 1 complete:** Sign-in, protected routes (`/history`, `/settings`), user preferences
- **Session strategy:** JWT (for Edge Runtime compatibility with Next.js middleware)
- **Progressive signup:** Anonymous users can generate schedules (saved to DB), sign in to access history
- **localStorage:** Form draft state only; all saved trips live in database
- **OAuth scopes (Phase 1):** `openid`, `email`, `profile`
- **OAuth scopes (Phase 2):** Add `calendar.events` for Google Calendar sync

### Calendar Integration

- **Write-only** — push events, never read user's calendar
- **Target calendar:** Primary calendar
- **Sync strategy:** Delete-and-replace (not complex two-way sync)
- **Event notifications:** Calendar event alerts at time of intervention

### Trip Storage & Sharing

- **All trips in database** — localStorage only for form draft state
- **Anonymous support:** Trips saved with `userId: null`, accessible by direct link
- **Shareable URLs:** Short codes (`/s/abc123`) for sharing schedules
- **Login required to share** — creates upsell moment, enables attribution
- **Trip history:** Users can view and delete past trips at `/trips`
- **Unified view:** Both `/trip/[id]` and `/s/[code]` use same display component

### Schedule View Modes

Two display modes controlled by `scheduleViewMode` user preference:

- **Summary mode (default)** — Condensed `DaySummaryCard` per day, today auto-expands, expand/collapse per day
- **Timeline mode** — Full `DaySection` with all intervention cards visible

### Minimal Shift Tips

For timezone shifts ≤2 hours (`MINIMAL_SHIFT_THRESHOLD_HOURS`), show a simplified tips card instead of full schedule:

- Brief explanation that small shifts don't need intensive intervention
- General tips (regular sleep, morning light, caffeine cutoff)
- "View full schedule" toggle to see detailed timeline if desired

### User Preferences (stored in DB)

- Default prep days
- Default wake/sleep times
- Uses melatonin (boolean)
- Uses caffeine (boolean)
- Caffeine cutoff hours before sleep
- Schedule view mode (summary/timeline)
- Show dual timezone (boolean)
- Use 24-hour time format (boolean)

### Trip Editing & Actuals Tracking

Authenticated users can edit trip preferences and record what actually happened vs. planned.

**Core Decisions:**

- **Default compliance assumption** — Interventions are assumed completed as planned unless explicitly recorded otherwise. No check-offs required; silence = compliance.
- **Wake/sleep anchors** — `wake_target` and `sleep_target` cannot be skipped. They anchor the schedule and must have a recorded time.
- **Skippable interventions** — Melatonin, light seeking, and other interventions can be marked as skipped.
- **Tense-aware UI** — Past interventions show "Done as planned" / "Done at different time" / "Skipped". Future interventions show "Will do as planned" / "Will do at different time" / "Will skip".
- **Smart deviation detection** — Cross-midnight times handled correctly (e.g., sleep target 11 PM, actual 2 AM = 3 hours late, not 21 hours early).
- **15-minute intervals** — Time picker uses 15-minute increments only.
- **Parent-child cascade** — Editing a parent intervention (like wake time) cascades changes to nested children (like light seeking).

**Editable Preferences:**

- Caffeine strategy (on/off)
- Melatonin (on/off)
- Schedule intensity (gentle/balanced/aggressive)

**Not Editable:** Origin, destination, flight times — changing these means creating a new trip.

**Implementation:** Phases 1-2 complete (UI, recording, preference editing). Phases 3-4 pending (model state snapshots, full Forger99 recalculation). Phase 5 future (Eight Sleep auto-actuals).

---

## MCP Interface

Public, read-only circadian tools for Claude to answer jet lag questions in other conversations.

- **Hosting:** Part of main app (not standalone)
- **Auth:** None required
- **Rate limit:** By IP (100 requests/hour)
- **Protocol:** JSON-RPC 2.0 at `POST /api/mcp`

### Implemented Tools

1. `calculate_phase_shift` — Hours of shift needed, direction, difficulty (~100ms)
2. `get_adaptation_plan` — Full intervention strategy for a trip (~1-2s)

### Planned Tools (Not Implemented)

3. `get_light_windows` — Optimal light exposure/avoidance times
4. `get_melatonin_timing` — When to take melatonin
5. `get_caffeine_strategy` — Caffeine timing for alertness
6. `estimate_adaptation_days` — Days until fully adapted

---

## UI Design

- **Style:** Pastel dawn-to-dusk gradient (sky blue → cream → peach → lavender)
- **Approach:** Mobile-first
- **Screens:** New trip, schedule view, history, settings
- **Artifact:** `dawnward-ui-v2.html`

### Timezone Display

Uses `Intl.DateTimeFormat` with `timeZoneName: "short"` for abbreviations. Output varies by timezone:

| Region | Example Output     | Notes                                     |
| ------ | ------------------ | ----------------------------------------- |
| US     | PST, PDT, EST, EDT | Friendly abbreviations                    |
| UK     | GMT, BST           | British Summer Time                       |
| Europe | GMT+1, GMT+2       | Offset format (CET/CEST on some browsers) |
| Asia   | GMT+9, GMT+8       | Offset format (JST/CST on some browsers)  |

The offset format (GMT+X) appears for timezones without universally recognized abbreviations. This is browser-dependent behavior from the Intl API.

---

## Database Schema

Key tables (full SQL in backend design doc):

- `users` — Google ID, email, default preferences
- `trips` — Container for legs, status, prep_days
- `legs` — Individual flights/segments with sequence ordering
- `schedules` — Generated plans with model_version, inputs_hash for cache invalidation
- `calendar_syncs` — Track which Google Calendar events we created
- `trip_feedback` — User ratings for completed trips (future model improvement)

---

## Future Features (Not v1)

### Daily Summary Email

- Send at 7am user's local time
- Summary of day's interventions
- **Needs:** Email provider (Resend, Postmark, or SendGrid — TBD)

### Eight Sleep Integration

- Pull actual sleep data to calibrate circadian phase
- Background sync via cron job
- Adaptive plans that update based on real sleep vs. predicted
- Spec document exists: `exploration/eight-sleep-integration.md`

### Other Future Considerations

- Flight lookup API (FlightAware, AeroDataBox)
- Push notifications (PWA or native)
- Apple/GitHub OAuth providers
- Eight Sleep bed temperature control (auto-cool at target bedtime)

---

## Open Items

| Item                          | Status                                             |
| ----------------------------- | -------------------------------------------------- |
| Curate airport JSON           | DONE — 7,168 airports in public/data/airports.json |
| Phase 1 Auth (Google sign-in) | DONE — JWT sessions, protected routes, user prefs  |
| Shareable URLs                | DONE — `/s/[code]` short links, trip history page  |
| Trip Editing (Phases 1-2)     | DONE — Preference editing, actuals recording UI    |
| Schedule View Modes           | DONE — Summary/timeline toggle, DaySummaryCard     |
| Minimal Shift Tips            | DONE — Simplified view for ≤2 hour shifts          |
| Timezone Rearchitecture       | DONE — Phase-aware dual timezone display           |
| Set up hello@dawnward.app     | TODO — Used for Google OAuth consent screen        |
| Phase 2 Auth (Calendar sync)  | TODO — Add calendar.events scope, sync API         |
| Trip Editing (Phases 3-4)     | TODO — Model state snapshots, Forger99 recalc      |
| Anonymous trip cleanup        | TODO — Cron job to clean up old anonymous trips    |

---

## Artifacts Reference

| Artifact           | Location                                 |
| ------------------ | ---------------------------------------- |
| Science research   | `science-methodology.md`                 |
| Backend design doc | `backend-design.md`                      |
| Auth design doc    | `auth-design.md`                         |
| Frontend design    | `frontend-design.md`                     |
| Brand guidelines   | `brand.md`                               |
| UI mockup          | `ui-v2.html`                             |
| Testing design doc | `testing-design.md`                      |
| This decisions doc | `decisions-overview.md`                  |
| Trip editing spec  | `completed/trip-editing-spec.md`         |
| Eight Sleep spec   | `exploration/eight-sleep-integration.md` |
| Actuals UX ideas   | `exploration/actuals-ux-ideas.md`        |
| Config audit       | `exploration/configuration-audit.md`     |
| Shovel-ready specs | `shovel_ready/*.md`                      |
| Completed designs  | `completed/*.md`                         |
