# Dawnward Backend Design Document

## Overview

Dawnward is a free, open-source web app for jet lag optimization. It uses the Arcascope circadian library (Forger99 model) to generate personalized schedules for adapting to new timezones via light exposure, melatonin timing, and caffeine strategy.

**Key features:**

- Multi-leg trip support
- Google Calendar sync (one-way push)
- Adaptive prep days (1-7 days, gentler shifts with more time)
- Public MCP interface for circadian queries

---

## Stack

| Layer          | Technology               | Notes                                  |
| -------------- | ------------------------ | -------------------------------------- |
| Framework      | Next.js 14+ (App Router) | Vercel-native, React Server Components |
| Auth           | NextAuth.js v5           | Google provider with Calendar scope    |
| Database       | Vercel Postgres          | Free tier (256MB)                      |
| Python Runtime | Vercel Python Functions  | For Arcascope circadian library        |
| Analytics      | Vercel Analytics         | Free tier                              |
| Repo           | GitHub                   | Vercel auto-deploys from main          |

---

## Database Schema

Use Vercel Postgres. All IDs are UUIDs. All timestamps are `timestamptz`.

```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),

  -- Defaults (user can override per-trip)
  default_prep_days INTEGER DEFAULT 3 CHECK (default_prep_days BETWEEN 1 AND 7),
  default_wake_time TIME DEFAULT '07:00',
  default_sleep_time TIME DEFAULT '23:00',
  uses_melatonin BOOLEAN DEFAULT false,
  uses_caffeine BOOLEAN DEFAULT true,
  caffeine_cutoff_hours INTEGER DEFAULT 6,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trips table (container for legs)
CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255), -- Optional friendly name like "Tokyo trip"
  status VARCHAR(20) DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed')),
  prep_days INTEGER NOT NULL CHECK (prep_days BETWEEN 1 AND 7),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Legs table (individual flights/segments)
CREATE TABLE legs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL, -- 1, 2, 3...

  -- Origin
  origin_airport VARCHAR(10),      -- IATA code: 'SFO'
  origin_city VARCHAR(255),        -- Fallback if no airport
  origin_tz VARCHAR(100) NOT NULL, -- IANA: 'America/Los_Angeles'

  -- Destination
  dest_airport VARCHAR(10),
  dest_city VARCHAR(255),
  dest_tz VARCHAR(100) NOT NULL,

  departure_datetime TIMESTAMPTZ NOT NULL,
  arrival_datetime TIMESTAMPTZ NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(trip_id, sequence)
);

-- Schedules table (generated plans)
CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID UNIQUE NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  model_version VARCHAR(50) NOT NULL, -- 'forger99-v1'
  inputs_hash VARCHAR(64) NOT NULL,   -- SHA-256 of inputs for cache invalidation
  schedule_data JSONB NOT NULL,       -- Full intervention timeline
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Calendar sync tracking
CREATE TABLE calendar_syncs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  google_calendar_id VARCHAR(255) NOT NULL, -- Which calendar events are in
  google_event_ids JSONB NOT NULL,          -- Array of event IDs we created
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(trip_id, user_id)
);

-- Trip feedback (for future model improvement)
CREATE TABLE trip_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  adaptation_rating INTEGER CHECK (adaptation_rating BETWEEN 1 AND 5),
  notes TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_trips_user_id ON trips(user_id);
CREATE INDEX idx_trips_status ON trips(status);
CREATE INDEX idx_legs_trip_id ON legs(trip_id);
CREATE INDEX idx_schedules_trip_id ON schedules(trip_id);
```

### Schedule Data Structure

The `schedule_data` JSONB column stores the model output:

```json
{
  "total_shift_hours": -8,
  "direction": "advance",
  "daily_targets": [
    { "day": -3, "cumulative_shift": -1.5 },
    { "day": -2, "cumulative_shift": -3.0 },
    { "day": -1, "cumulative_shift": -4.5 },
    { "day": 0, "cumulative_shift": -6.0 },
    { "day": 1, "cumulative_shift": -7.5 },
    { "day": 2, "cumulative_shift": -8.0 }
  ],
  "interventions": [
    {
      "day": -3,
      "items": [
        {
          "time": "06:00",
          "type": "light_seek",
          "duration_min": 30,
          "description": "Get bright light exposure"
        },
        {
          "time": "21:30",
          "type": "melatonin",
          "dose_mg": 0.5,
          "description": "Take melatonin"
        },
        {
          "time": "22:00",
          "type": "sleep_target",
          "description": "Target bedtime"
        }
      ]
    }
  ]
}
```

Intervention types:

- `light_seek` — Get bright light (outdoor or lightbox)
- `light_avoid` — Wear sunglasses, dim screens
- `melatonin` — Take melatonin dose
- `caffeine_ok` — Caffeine allowed until this time
- `caffeine_cutoff` — Stop caffeine
- `caffeine_boost` — Strategic caffeine for alertness
- `sleep_target` — Target bedtime
- `wake_target` — Target wake time

---

## API Routes

### Auth

```
GET/POST /api/auth/[...nextauth]
```

NextAuth.js v5 handler. Configure with:

- Google provider
- Scopes: `openid`, `email`, `profile`, `https://www.googleapis.com/auth/calendar.events`
- Callbacks to create/update user in database
- JWT strategy (stateless)

### User

```
GET  /api/user          → Get current user profile + preferences
PATCH /api/user         → Update preferences
```

Request (PATCH):

```json
{
  "default_prep_days": 5,
  "default_wake_time": "06:30",
  "uses_melatonin": true
}
```

### Trips

```
GET    /api/trips              → List user's trips (with optional status filter)
POST   /api/trips              → Create trip with legs
GET    /api/trips/[id]         → Get trip with legs and schedule
PATCH  /api/trips/[id]         → Update trip metadata or legs
DELETE /api/trips/[id]         → Delete trip (cascades to legs, schedule, sync)
```

Request (POST /api/trips):

```json
{
  "name": "Tokyo business trip",
  "prep_days": 3,
  "legs": [
    {
      "origin_airport": "SFO",
      "origin_tz": "America/Los_Angeles",
      "dest_airport": "NRT",
      "dest_tz": "Asia/Tokyo",
      "departure_datetime": "2026-02-15T11:30:00-08:00",
      "arrival_datetime": "2026-02-16T15:45:00+09:00"
    }
  ]
}
```

Response includes generated schedule (compute on create).

### Schedule

```
GET  /api/trips/[id]/schedule      → Get current schedule
POST /api/trips/[id]/schedule      → Force regenerate schedule
```

Schedule generation logic:

1. Compute `inputs_hash` = SHA-256 of (legs data + user prefs + prep_days)
2. If existing schedule has same hash, return cached
3. Otherwise, call Python function to generate new schedule
4. Store in `schedules` table

### Calendar Sync

```
POST   /api/trips/[id]/calendar    → Push schedule to Google Calendar
DELETE /api/trips/[id]/calendar    → Remove events from Google Calendar
```

Sync logic (POST):

1. If existing sync, delete all events by stored IDs
2. Create events for each intervention
3. Store new event IDs in `calendar_syncs`

Event creation guidelines:

- Use 15-minute calendar events for point-in-time interventions (melatonin, caffeine)
- Use actual duration for light exposure windows
- Set reminders: 15 min before for actions, none for info-only
- Event title format: "🌅 Light exposure" / "💊 Melatonin" / "☕ Caffeine cutoff"
- Event description: Include the full context from intervention

### Feedback

```
POST /api/trips/[id]/feedback     → Submit trip feedback
GET  /api/trips/[id]/feedback     → Get feedback if exists
```

---

## MCP Interface

Public read-only endpoint at `/api/mcp`. No authentication required. Rate limit by IP (100 requests/hour).

### Endpoint

```
GET  /api/mcp/tools     → Returns tool definitions (JSON Schema)
POST /api/mcp/invoke    → Execute a tool
```

Request (POST /api/mcp/invoke):

```json
{
  "tool": "get_adaptation_plan",
  "inputs": {
    "origin_timezone": "America/Los_Angeles",
    "destination_timezone": "Asia/Tokyo",
    "departure_datetime": "2026-02-15T11:30:00-08:00",
    "prep_days_available": 3,
    "uses_melatonin": true,
    "uses_caffeine": true,
    "usual_wake_time": "07:00"
  }
}
```

Response:

```json
{
  "result": {
    "total_shift_hours": -8,
    "direction": "advance",
    "recommended_prep_days": 3,
    "daily_shift_target": 1.5,
    "strategy_summary": "You need to advance your body clock by 8 hours. Starting 3 days before departure, shift ~1.5 hours per day using morning light and evening melatonin.",
    "interventions": [...]
  }
}
```

### Tools

#### calculate_phase_shift

Calculate hours of circadian shift needed between timezones.

```json
{
  "name": "calculate_phase_shift",
  "description": "Calculate hours of circadian shift needed between timezones and whether to advance or delay",
  "inputSchema": {
    "type": "object",
    "properties": {
      "origin_timezone": {
        "type": "string",
        "description": "IANA timezone, e.g., 'America/Los_Angeles'"
      },
      "destination_timezone": {
        "type": "string",
        "description": "IANA timezone, e.g., 'Asia/Tokyo'"
      }
    },
    "required": ["origin_timezone", "destination_timezone"]
  }
}
```

Output:

```json
{
  "shift_hours": -8,
  "direction": "advance",
  "difficulty": "hard"
}
```

Difficulty thresholds: easy (1-3h), moderate (4-6h), hard (7+h).

#### get_adaptation_plan

Full adaptation strategy for a trip.

```json
{
  "name": "get_adaptation_plan",
  "description": "Get complete jet lag adaptation strategy including daily interventions",
  "inputSchema": {
    "type": "object",
    "properties": {
      "origin_timezone": { "type": "string" },
      "destination_timezone": { "type": "string" },
      "departure_datetime": { "type": "string", "format": "date-time" },
      "prep_days_available": {
        "type": "integer",
        "minimum": 1,
        "maximum": 7,
        "default": 3
      },
      "uses_melatonin": { "type": "boolean", "default": false },
      "uses_caffeine": { "type": "boolean", "default": true },
      "usual_wake_time": {
        "type": "string",
        "pattern": "^[0-2][0-9]:[0-5][0-9]$",
        "default": "07:00"
      },
      "usual_sleep_time": {
        "type": "string",
        "pattern": "^[0-2][0-9]:[0-5][0-9]$",
        "default": "23:00"
      }
    },
    "required": [
      "origin_timezone",
      "destination_timezone",
      "departure_datetime"
    ]
  }
}
```

#### get_light_windows

Optimal light exposure/avoidance for a specific day in adaptation.

```json
{
  "name": "get_light_windows",
  "description": "Calculate optimal light exposure and avoidance windows for circadian shifting",
  "inputSchema": {
    "type": "object",
    "properties": {
      "current_phase_offset": {
        "type": "number",
        "description": "Current offset from home timezone in hours"
      },
      "target_shift_today": {
        "type": "number",
        "description": "Hours to shift today (positive=delay, negative=advance)"
      },
      "usual_wake_time": { "type": "string", "default": "07:00" }
    },
    "required": ["current_phase_offset", "target_shift_today"]
  }
}
```

#### get_melatonin_timing

When to take melatonin for circadian shifting.

```json
{
  "name": "get_melatonin_timing",
  "description": "Calculate optimal melatonin timing for circadian phase shifting",
  "inputSchema": {
    "type": "object",
    "properties": {
      "current_phase_offset": { "type": "number" },
      "target_shift_today": { "type": "number" },
      "usual_sleep_time": { "type": "string", "default": "23:00" }
    },
    "required": ["current_phase_offset", "target_shift_today"]
  }
}
```

#### get_caffeine_strategy

Caffeine timing for alertness without disrupting adaptation.

```json
{
  "name": "get_caffeine_strategy",
  "description": "Calculate caffeine strategy for alertness while protecting sleep",
  "inputSchema": {
    "type": "object",
    "properties": {
      "target_sleep_time": { "type": "string" },
      "cutoff_hours_before_sleep": { "type": "integer", "default": 6 },
      "current_local_time": { "type": "string" },
      "alertness_needed": {
        "type": "string",
        "enum": ["normal", "high"],
        "default": "normal"
      }
    },
    "required": ["target_sleep_time"]
  }
}
```

#### estimate_adaptation_days

How long until fully adapted to new timezone.

```json
{
  "name": "estimate_adaptation_days",
  "description": "Estimate days needed to fully adapt to destination timezone",
  "inputSchema": {
    "type": "object",
    "properties": {
      "shift_hours": { "type": "number" },
      "uses_interventions": { "type": "boolean", "default": true }
    },
    "required": ["shift_hours"]
  }
}
```

---

## Python Functions

### Directory Structure

```
/api/
├── python/
│   └── circadian/
│       ├── __init__.py
│       ├── model.py           # Forger99 wrapper
│       ├── phase_shift.py     # calculate_phase_shift()
│       ├── light.py           # get_light_windows()
│       ├── melatonin.py       # get_melatonin_timing()
│       ├── caffeine.py        # get_caffeine_strategy()
│       ├── adaptation.py      # estimate_adaptation_days()
│       └── schedule.py        # generate_full_schedule()
```

### Dependencies

```
circadian>=0.1.0  # Arcascope library
numpy
```

### Adaptive Algorithm

The shift rate depends on **direction** and **prep days**. Rates assume ~70% real-world compliance:

```python
def calculate_daily_shift_rate(direction: str, prep_days: int) -> float:
    """
    Direction-aware shift rates (per realistic-flight-responses.md).

    Advances are physiologically harder than delays:
    - Literature max: advance ~1.5h/day, delay ~2.0h/day
    - Realistic with compliance: advance ~1.0h/day, delay ~1.5h/day
    """
    if direction == "advance":
        # Advances are harder - 1.0h/day is realistic
        return 1.0
    else:
        # Delays are easier, but use conservative rate
        if prep_days >= 5:
            return 1.0  # Gentle adaptation
        else:
            return 1.5  # Standard delay rate

# Estimated adaptation days = total_shift / daily_rate
# Example: 8h advance at 1.0h/day = 8 days
# Example: 8h delay at 1.5h/day = 6 days
```

### Model Integration

The Arcascope `circadian` library implements the Forger99 model (Forger-Jewett-Kronauer). Key functions:

```python
from circadian import Forger99

model = Forger99()

# Simulate phase under light schedule
# Returns circadian phase trajectory
trajectory = model.simulate(
    light_schedule=light_values,  # Lux values over time
    duration_hours=72
)

# Get current circadian phase
phase = model.get_phase(trajectory, time_point)

# Calculate phase response to light pulse
prc = model.phase_response_curve(
    light_intensity=10000,  # Lux
    duration_hours=1,
    circadian_time=ct       # When in circadian cycle
)
```

Use the PRC (phase response curve) to determine:

- Light before CBTmin (core body temp minimum) → delays clock
- Light after CBTmin → advances clock
- CBTmin is typically ~2-3 hours before habitual wake time

---

## Static Data

### Airport Data

Bundle `/public/data/airports.json`:

```json
[
  {
    "code": "SFO",
    "name": "San Francisco International",
    "city": "San Francisco",
    "country": "US",
    "tz": "America/Los_Angeles"
  },
  {
    "code": "NRT",
    "name": "Narita International",
    "city": "Tokyo",
    "country": "JP",
    "tz": "Asia/Tokyo"
  }
]
```

Source: OurAirports dataset, filtered to `large_airport` and `medium_airport` types (~2000 entries). Can trim to top ~500-1000 by passenger volume if needed.

### City Fallback

Bundle `/public/data/cities.json` for non-airport entries:

```json
[
  {
    "name": "London",
    "country": "GB",
    "tz": "Europe/London"
  }
]
```

Source: Geonames cities with population > 100,000.

### Typeahead Behavior

Client-side search:

1. Search airports by code (exact prefix) and city name (fuzzy)
2. Search cities by name (fuzzy)
3. Display airports first, then cities
4. Format: "SFO - San Francisco International" / "San Francisco (city)"

---

## Google Calendar Integration

### Auth Scopes

Request these scopes in NextAuth:

```
openid
email
profile
https://www.googleapis.com/auth/calendar.events
```

The `calendar.events` scope allows creating/modifying/deleting events without full calendar access.

### Event Creation

For each intervention, create a Google Calendar event:

```javascript
const event = {
  summary: getEventTitle(intervention.type), // "🌅 Light exposure"
  description: intervention.description,
  start: {
    dateTime: intervention.datetime,
    timeZone: intervention.timezone,
  },
  end: {
    dateTime: addMinutes(intervention.datetime, intervention.duration || 15),
    timeZone: intervention.timezone,
  },
  reminders: {
    useDefault: false,
    overrides: [{ method: "popup", minutes: 15 }],
  },
};
```

Event titles by type:

- `light_seek` → "🌅 Seek bright light"
- `light_avoid` → "🕶️ Avoid bright light"
- `melatonin` → "💊 Take melatonin"
- `caffeine_ok` → "☕ Caffeine OK until now"
- `caffeine_cutoff` → "🚫 Caffeine cutoff"
- `sleep_target` → "😴 Target bedtime"
- `wake_target` → "⏰ Target wake time"

### Grouping Same-Time Events

**Future consideration:** When multiple interventions occur at the same time (e.g., wake_target + light_seek + caffeine_ok all at 10:00 AM), consider grouping them into a single calendar event rather than creating separate events. This would reduce calendar clutter and match the nested card treatment in the UI.

Possible approaches:
- Single event with combined title: "⏰ Wake up: Light + Caffeine"
- Single event with bullet-point description listing all interventions
- Parent event with sub-events (if calendar API supports)

### Sync Strategy

One-way push with delete-and-replace:

```javascript
async function syncToCalendar(tripId, userId) {
  // 1. Check for existing sync
  const existingSync = await db.calendarSyncs.findUnique({
    where: { tripId_userId: { tripId, userId } },
  });

  // 2. Delete old events if they exist
  if (existingSync) {
    for (const eventId of existingSync.googleEventIds) {
      await calendar.events.delete({
        calendarId: "primary",
        eventId,
      });
    }
  }

  // 3. Get schedule
  const schedule = await db.schedules.findUnique({ where: { tripId } });

  // 4. Create new events
  const newEventIds = [];
  for (const day of schedule.scheduleData.interventions) {
    for (const item of day.items) {
      const event = await calendar.events.insert({
        calendarId: "primary",
        requestBody: buildCalendarEvent(item, day.date),
      });
      newEventIds.push(event.data.id);
    }
  }

  // 5. Store sync record
  await db.calendarSyncs.upsert({
    where: { tripId_userId: { tripId, userId } },
    create: {
      tripId,
      userId,
      googleCalendarId: "primary",
      googleEventIds: newEventIds,
    },
    update: { googleEventIds: newEventIds, lastSyncedAt: new Date() },
  });
}
```

---

## Environment Variables

```bash
# Database
POSTGRES_URL=
POSTGRES_PRISMA_URL=
POSTGRES_URL_NON_POOLING=

# NextAuth
NEXTAUTH_URL=https://dawnward.app
NEXTAUTH_SECRET=

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Optional
RATE_LIMIT_DISABLED=false  # For development
```

---

## Error Handling

### API Errors

Return consistent error format:

```json
{
  "error": {
    "code": "TRIP_NOT_FOUND",
    "message": "Trip not found or access denied"
  }
}
```

Error codes:

- `UNAUTHORIZED` — Not logged in (401)
- `FORBIDDEN` — Logged in but not owner (403)
- `NOT_FOUND` — Resource doesn't exist (404)
- `VALIDATION_ERROR` — Bad input (400)
- `CALENDAR_SYNC_FAILED` — Google Calendar API error (502)
- `SCHEDULE_GENERATION_FAILED` — Python function error (500)

### Calendar Sync Failures

If Google Calendar API fails:

1. Log error with details
2. Return error to client with reason
3. Do NOT update `calendar_syncs` record
4. Client can retry

### Schedule Generation Failures

If Python function fails:

1. Log error
2. Return 500 with `SCHEDULE_GENERATION_FAILED`
3. Do NOT cache failed result
4. Include fallback: if model completely fails, return rule-of-thumb schedule based on simple heuristics

---

## Testing Notes

### Key Test Cases

1. **Multi-leg trip** — SFO → NRT → SIN, verify schedule handles intermediate adaptation
2. **Short prep** — 1 day prep for 12-hour shift, verify aggressive but safe limits
3. **Long prep** — 7 days for same shift, verify gentle daily targets
4. **Westward vs eastward** — Verify advance vs delay direction correct
5. **Calendar sync idempotency** — Sync twice, verify no duplicate events
6. **Schedule cache** — Same inputs, verify no regeneration
7. **Schedule invalidation** — Change leg time, verify regeneration

### MCP Testing

Test each tool independently:

```bash
curl -X POST https://dawnward.app/api/mcp/invoke \
  -H "Content-Type: application/json" \
  -d '{"tool": "calculate_phase_shift", "inputs": {"origin_timezone": "America/Los_Angeles", "destination_timezone": "Asia/Tokyo"}}'
```

---

## Future Considerations

Not in v1, but designed to accommodate:

1. **Flight lookup API** — Could add FlightAware/AeroDataBox integration to auto-populate leg details from flight number

2. **Push notifications** — PWA or native app could send reminders; schema supports this via intervention timestamps

3. **Model improvements** — `trip_feedback` table collects data for future model tuning; `model_version` in schedules enables A/B testing

4. **Sharing** — Trip schedules could be shareable via public link; would need `trips.share_token` column

5. **Widgets** — MCP interface already enables Claude to answer jet lag questions; could expand to other AI assistants
