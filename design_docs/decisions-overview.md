# Dawnward: All Decisions

## Project Overview

**Dawnward** is a free, open-source jet lag optimization app. Uses the Arcascope circadian library (Forger99 model) to generate personalized schedules for adapting to new timezones via light exposure, melatonin timing, and caffeine strategy.

---

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16+ (App Router) |
| Hosting | Vercel |
| Auth | NextAuth.js v5, Google only |
| Database | Vercel Postgres (free tier) |
| Python Runtime | Vercel Python functions (accept cold starts) |
| Circadian Model | Arcascope library, Forger99 model |
| Analytics | Vercel Analytics |
| Repo | GitHub, MIT license, private until MVP |

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
- **Progressive signup:** Anonymous users can generate one schedule, then sign in to save
- **localStorage:** Used only as OAuth bridge (holds one trip during redirect, clears after login or 24h)
- **OAuth scopes:** `openid`, `email`, `profile`, `calendar.events`

### Calendar Integration
- **Write-only** — push events, never read user's calendar
- **Target calendar:** Primary calendar
- **Sync strategy:** Delete-and-replace (not complex two-way sync)
- **Event notifications:** Calendar event alerts at time of intervention

### User Preferences (stored in DB)
- Default prep days
- Default wake/sleep times
- Uses melatonin (boolean)
- Uses caffeine (boolean)
- Caffeine cutoff hours before sleep

---

## MCP Interface

Public, read-only circadian tools for Claude to answer jet lag questions in other conversations.

- **Hosting:** Part of main app (not standalone)
- **Auth:** None required
- **Rate limit:** By IP (100 requests/hour)

### Tools
1. `calculate_phase_shift` — Hours of shift needed, direction, difficulty
2. `get_adaptation_plan` — Full intervention strategy for a trip
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
- Spec document exists: `eight-sleep-integration.md`

### Other Future Considerations
- Flight lookup API (FlightAware, AeroDataBox)
- Push notifications (PWA or native)
- Trip sharing via public link
- Apple/GitHub OAuth providers
- Eight Sleep bed temperature control (auto-cool at target bedtime)

---

## Open Items

| Item | Status |
|------|--------|
| Curate airport JSON | DONE — 7,168 airports in public/data/airports.json |

---

## Artifacts Reference

| Artifact | Location |
|----------|----------|
| Science research | `science-methodology.md` |
| Backend design doc | `backend-design.md` |
| Auth design doc | `auth-design.md` |
| UI mockup | `ui-v2.html` |
| Eight Sleep spec | `eight-sleep-integration.md` |
| Testing design doc | `testing-design.md` |
| This decisions doc | `decisions-overview.md` |
