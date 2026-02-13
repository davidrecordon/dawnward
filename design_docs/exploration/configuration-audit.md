# Configuration Audit: Hardcoded Constants & User Preference Candidates

## Goal

Document all hardcoded constants in the codebase, categorize them, and identify candidates for:

1. Centralized system configuration
2. User-configurable preferences (future work)

---

## Python Backend Constants

### Category 1: Immutable Science Constants (DO NOT CHANGE)

These are from peer-reviewed circadian research. Changing breaks the Forger99 model.

#### Circadian Markers (`markers.py`)

| Line | Constant             | Value | Source                      |
| ---- | -------------------- | ----- | --------------------------- |
| 22   | `CBTMIN_BEFORE_WAKE` | 2.5h  | Czeisler & Gooley 2007      |
| 23   | `DLMO_BEFORE_SLEEP`  | 2.0h  | Burgess et al. 2010         |
| 24   | `DLMO_TO_CBTMIN`     | 6.0h  | Core circadian relationship |

#### Light Phase Response Curve (`prc.py`)

| Line | Constant              | Value | Source      |
| ---- | --------------------- | ----- | ----------- |
| 30   | `ADVANCE_ZONE_START`  | 0h    | Khalsa 2003 |
| 31   | `ADVANCE_ZONE_END`    | 4h    | Khalsa 2003 |
| 32   | `ADVANCE_PEAK`        | 2.5h  | Khalsa 2003 |
| 34   | `DELAY_ZONE_START`    | -4h   | Khalsa 2003 |
| 35   | `DELAY_ZONE_END`      | 0h    | Khalsa 2003 |
| 36   | `DELAY_PEAK`          | -2.5h | Khalsa 2003 |
| 39   | `MAX_ADVANCE_PER_DAY` | 2.0h  | Khalsa 2003 |
| 40   | `MAX_DELAY_PER_DAY`   | 3.4h  | Khalsa 2003 |

#### Melatonin Phase Response Curve (`prc.py`)

| Line | Constant              | Value | Source                                     |
| ---- | --------------------- | ----- | ------------------------------------------ |
| 162  | `ADVANCE_OPTIMAL`     | -5.0h | Burgess 2010                               |
| 163  | `DELAY_OPTIMAL`       | 10.0h | Burgess 2010                               |
| 166  | `MAX_ADVANCE_PER_DAY` | 1.5h  | Burgess 2010                               |
| 167  | `MAX_DELAY_PER_DAY`   | 1.0h  | Burgess 2010                               |
| 209  | Delay threshold       | 6.0h  | Recommend delay melatonin for shifts >= 6h |

#### Two-Process Model (`sleep_pressure.py`)

| Line | Constant                    | Value | Source       |
| ---- | --------------------------- | ----- | ------------ |
| 23   | `FULL_SLEEP_CYCLE_MIN`      | 90    | Borbély      |
| 24   | `SLEEP_CYCLES_FOR_RECOVERY` | 4     | Borbély      |
| 25   | `NAP_INERTIA_THRESHOLD_MIN` | 30    | Borbély      |
| 28   | `STANDARD_WAKE_HOURS`       | 16    | Borbély      |
| 29   | `PRESSURE_BUILD_RATE`       | 1.0   | Borbély      |
| 30   | `PRESSURE_DECAY_RATE`       | 0.5   | Borbély      |
| 251  | Wake maintenance zone start | 3h    | Before sleep |
| 252  | Wake maintenance zone end   | 1h    | Before sleep |

#### Nap Windows (`sleep_pressure.py`)

| Line | Constant                      | Value | Purpose                                               |
| ---- | ----------------------------- | ----- | ----------------------------------------------------- |
| 33   | `STANDARD_NAP_START_PERCENT`  | 0.30  | 30% into wake period                                  |
| 34   | `STANDARD_NAP_END_PERCENT`    | 0.50  | 50% into wake period                                  |
| 35   | `HIGH_DEBT_NAP_START_PERCENT` | 0.25  | Earlier window when sleep-deprived                    |
| 36   | `HIGH_DEBT_NAP_END_PERCENT`   | 0.55  | Wider window when sleep-deprived                      |
| 43   | `ARRIVAL_NAP_CUTOFF_HOUR`     | 13    | 1:00 PM - no arrival naps after                       |
| 56   | `ARRIVAL_SETTLE_IN_MINUTES`   | 150   | 2.5h buffer for customs, baggage, transport, check-in |

### Category 2: Algorithm Configuration (Keep as Module-Level Constants)

System behavior constants. **Not recommended to centralize** - these are already well-organized
as module-level constants co-located with their usage. Centralizing would increase coupling
between independent modules without meaningful benefit. The current pattern of named constants
at the top of each module is the right choice for this codebase size.

#### Phase Generation (`phase_generator.py`)

| Line    | Constant                            | Value | Purpose                                |
| ------- | ----------------------------------- | ----- | -------------------------------------- |
| 33      | `PRE_DEPARTURE_BUFFER_HOURS`        | 3.0   | Airport arrival buffer                 |
| 34      | `ULR_FLIGHT_THRESHOLD_HOURS`        | 12.0  | Ultra-long-range flight classification |
| 37      | `OVERNIGHT_DEPARTURE_EARLIEST_HOUR` | 19    | 7 PM — start of red-eye window         |
| 38      | `OVERNIGHT_DEPARTURE_LATEST_HOUR`   | 1     | 1 AM — end of red-eye window           |
| 39      | `OVERNIGHT_ARRIVAL_LATEST_HOUR`     | 14    | 2 PM — latest arrival for overnight    |
| 181     | Layover threshold (short)           | 48h   | Aim-through strategy                   |
| 183     | Layover threshold (medium)          | 96h   | Partial adaptation                     |
| 369-374 | In-flight sleep windows             | 2h/4h | Window offsets and max durations       |

#### Shift Calculator (`shift_calculator.py`)

| Line  | Intensity  | Advance Rate | Delay Rate | Purpose                 |
| ----- | ---------- | ------------ | ---------- | ----------------------- |
| 54-55 | Gentle     | 0.75h/day    | 1.0h/day   | Conservative shifting   |
| 58-59 | Balanced   | 1.0h/day     | 1.5h/day   | Good trade-off          |
| 62-63 | Aggressive | 1.25h/day    | 2.0h/day   | Fastest adaptation      |
| 196   | Full day   | 16h          | -          | Hours for full target   |
| 198   | Min day    | 8h           | -          | Hours for scaled target |

#### Constraint Filter (`constraint_filter.py`)

| Line | Constant                              | Value | Purpose                             |
| ---- | ------------------------------------- | ----- | ----------------------------------- |
| 20   | `SLEEP_TARGET_DEPARTURE_BUFFER_HOURS` | 4.0   | Filter sleep targets near departure |
| 219  | Early morning threshold               | 6:00  | Exception for early interventions   |

#### Intervention Planner (`intervention_planner.py`)

| Line | Constant                         | Value | Purpose                                          |
| ---- | -------------------------------- | ----- | ------------------------------------------------ |
| 37   | `CREW_WAKE_BEFORE_LANDING_HOURS` | 1     | Cap wake_target to 1h before landing             |
| 40   | `AIRPORT_BUFFER_HOURS`           | 3     | Cap pre-departure wake/sleep to 3h before flight |
| 50   | `OVERNIGHT_SETTLING_HOURS`       | 0.75  | 45 min settling for red-eye flights              |
| 51   | `OVERNIGHT_PRE_LANDING_HOURS`    | 0.5   | 30 min pre-landing buffer for red-eyes           |

#### Scheduler (`scheduler_v2.py`)

| Line | Constant                           | Value | Purpose                    |
| ---- | ---------------------------------- | ----- | -------------------------- |
| 34   | `SHORT_FLIGHT_THRESHOLD_HOURS`     | 6     | Skip in-transit < 6h       |
| 35   | `PAST_INTERVENTION_BUFFER_MINUTES` | 30    | Grace period for filtering |

#### Recalculation (`recalculation.py`)

| Line  | Constant                     | Value | Purpose                                |
| ----- | ---------------------------- | ----- | -------------------------------------- |
| 56    | `MIN_SHIFT_DIFFERENCE_HOURS` | 0.25  | Recalculation trigger threshold        |
| 59    | `MIN_EFFECTIVENESS_FLOOR`    | 0.5   | Minimum effectiveness multiplier       |
| 62-73 | `COMPLIANCE_MULTIPLIERS`     | dict  | Intervention-type compliance penalties |

**COMPLIANCE_MULTIPLIERS values:**

```python
COMPLIANCE_MULTIPLIERS = {
    "light_seek": 0.8,     # Missed light = 80% effective
    "light_avoid": 0.9,    # Missed avoid = 90% effective
    "melatonin": 0.7,      # Missed melatonin = 70% effective
    "caffeine_cutoff": 0.95,  # Caffeine slip = 95% effective
    "sleep_target": 0.6,   # Wrong sleep time = 60% effective
    "wake_target": 0.7,    # Wrong wake time = 70% effective
}
```

---

## TypeScript Frontend Constants

### Already Centralized

**File:** `src/types/trip-form.ts:49-62`

```typescript
export const defaultFormState: TripFormState = {
  useMelatonin: true, // User preference
  useCaffeine: true, // User preference
  useExercise: false, // User preference
  napPreference: "flight_only", // User preference
  scheduleIntensity: "balanced", // User preference
  wakeTime: "07:00", // User preference
  sleepTime: "22:00", // User preference
  prepDays: 3, // User preference
};
```

### Time & Date Configuration

| File                   | Line  | Value   | Purpose                     |
| ---------------------- | ----- | ------- | --------------------------- |
| `time-select.tsx`      | 32    | 15 min  | Time picker increment       |
| `datetime-select.tsx`  | 31    | "12:00" | Default time when date-only |
| `prep-days-slider.tsx` | 19-20 | 1-7     | Prep days min/max           |
| `prep-days-slider.tsx` | 47    | 1       | Slider step value           |

### API & Validation

| File                  | Line | Value   | Purpose                    |
| --------------------- | ---- | ------- | -------------------------- |
| `route.ts` (generate) | 47   | 1-7     | Prep days validation range |
| `route.ts` (generate) | 168  | 30000ms | Python process timeout     |

### Time Period Boundaries (`time-utils.ts`)

| Line   | Period    | Hours | Purpose            |
| ------ | --------- | ----- | ------------------ |
| 117    | Morning   | 5-12  | 5:00 AM - 11:59 AM |
| 118    | Afternoon | 12-17 | 12:00 PM - 4:59 PM |
| 119    | Evening   | 17-21 | 5:00 PM - 8:59 PM  |
| (else) | Night     | 21-5  | 9:00 PM - 4:59 AM  |

### Phase Ordering (`schedule-utils.ts:36-43`)

```typescript
const PHASE_ORDER: Record<Phase, number> = {
  preparation: 0,
  pre_departure: 1,
  in_transit: 2,
  in_transit_ulr: 2, // Ultra-long-range flights (12+ hours)
  post_arrival: 3,
  adaptation: 4,
};
```

### Search Configuration (`airport-search.ts`)

| Line | Constant         | Value | Purpose                     |
| ---- | ---------------- | ----- | --------------------------- |
| 37   | Code weight      | 3     | Fuse.js airport code weight |
| 38   | City weight      | 2     | Fuse.js city name weight    |
| 39   | Name weight      | 1     | Fuse.js airport name weight |
| 41   | Fuse threshold   | 0.3   | Fuzzy search strictness     |
| 44   | Min match length | 2     | Minimum chars to search     |
| 61   | Default limit    | 10    | Max search results          |

### Shift Magnitude & Prep Days (`timezone-utils.ts`)

| Line | Constant                        | Value | Purpose                                    |
| ---- | ------------------------------- | ----- | ------------------------------------------ |
| 13   | `MINIMAL_SHIFT_THRESHOLD_HOURS` | 2     | Shift threshold below which no prep needed |
| 16   | `PREP_DAYS_THRESHOLDS.SMALL`    | 4     | 3-4h shifts get 1 prep day                 |
| 17   | `PREP_DAYS_THRESHOLDS.MEDIUM`   | 6     | 5-6h shifts get 2 prep days                |
| 18   | `PREP_DAYS_THRESHOLDS.LARGE`    | 9     | 7-9h shifts get 3 prep days                |

### Schedule View Constants

UI timing and display threshold constants.

| File                     | Line | Constant                         | Value | Purpose                                        |
| ------------------------ | ---- | -------------------------------- | ----- | ---------------------------------------------- |
| `minimal-shift-tips.tsx` | 8    | `CAFFEINE_CUTOFF_HOURS`          | 8     | Hours before bedtime to avoid caffeine         |
| `schedule-header.tsx`    | 11   | `SHOW_DIRECTION_THRESHOLD_HOURS` | 10    | Min shift to show "Adapting via advance/delay" |
| `trip-schedule-view.tsx` | 67   | `SUMMARY_BANNER_DISMISS_MS`      | 5000  | Auto-dismiss recalculation banner              |
| `trip-schedule-view.tsx` | 70   | `SCROLL_TO_NOW_DELAY_MS`         | 100   | Delay before scrolling to now marker           |

### Calendar Integration (`google-calendar.ts`)

#### Event Density Configuration

Anchor-based grouping reduces calendar clutter (~20 events → ~10 events per trip):

| Constant              | Value                                              | Purpose                        |
| --------------------- | -------------------------------------------------- | ------------------------------ |
| `STANDALONE_TYPES`    | caffeine_cutoff, exercise, nap_window, light_avoid | Never grouped with anchors     |
| `GROUPING_WINDOW_MIN` | 120                                                | Minutes within anchor to group |

#### Event Durations

| Type              | Duration            | Notes                         |
| ----------------- | ------------------- | ----------------------------- |
| `wake_target`     | 15 min              | Point-in-time reminder        |
| `sleep_target`    | 15 min              | Point-in-time reminder        |
| `melatonin`       | 15 min              | Point-in-time reminder        |
| `caffeine_cutoff` | 15 min              | Reminder                      |
| `exercise`        | 45 min              | Typical workout               |
| `light_seek`      | from `duration_min` | User preference (30/45/60/90) |
| `light_avoid`     | from `duration_min` | PRC-calculated window (2-4h)  |
| `nap_window`      | from `duration_min` | Calculated nap window         |

#### Reminder Times (before event)

| Type              | Reminder | Notes                          |
| ----------------- | -------- | ------------------------------ |
| `wake_target`     | 0 min    | Immediate - alarm is the event |
| `sleep_target`    | 30 min   | Wind-down period               |
| `exercise`        | 15 min   | Brief heads-up                 |
| `caffeine_cutoff` | 15 min   | Brief heads-up                 |
| All others        | 15 min   | Default                        |

#### Busy/Free Status

| Shows as Busy | Shows as Free                                                 |
| ------------- | ------------------------------------------------------------- |
| `nap_window`  | `wake_target`, `sleep_target`, `melatonin`, `caffeine_cutoff` |
| `exercise`    | `light_seek`, `light_avoid`                                   |

Note: `sleep_target` was intentionally kept as "free" since users may not always follow the exact bedtime.

#### Wake/Sleep Event Handling

Early morning sleep times (00:00-05:59) require special handling because the scheduler's "schedule day" differs from the actual calendar day. For example, a 2:30 AM sleep at the end of Day -1's schedule should appear on the next calendar day.

| Line | Constant                    | Value               | Purpose                                               |
| ---- | --------------------------- | ------------------- | ----------------------------------------------------- |
| 45   | `DEDUP_WINDOW_MIN`          | GROUPING_WINDOW_MIN | Shared dedup window for wake/sleep events (2h)        |
| 51   | `LATE_NIGHT_THRESHOLD_HOUR` | 6                   | Hours below which sleep is considered "early morning" |

**Date adjustment logic:** In `buildCalendarEvent()`, sleep_target events with times before 06:00 get +1 day added to their calendar date. This ensures that "late night" sleep (end of a schedule day) appears on the correct calendar date.

**Deduplication:** Both wake and sleep events use the same 2-hour window (`DEDUP_WINDOW_MIN`, which references `GROUPING_WINDOW_MIN`) to prevent duplicates when times shift across consecutive days.

#### Other Constants

| Line | Constant                     | Value | Purpose                      |
| ---- | ---------------------------- | ----- | ---------------------------- |
| 47   | `DEFAULT_EVENT_DURATION_MIN` | 15    | Fallback when not configured |
| 67   | `DEFAULT_REMINDER_MINUTES`   | 15    | Fallback reminder time       |
| 99   | `DEFAULT_EMOJI`              | "📋"  | Fallback emoji for events    |

### Flight Phase Constants (`intervention-utils.ts`)

| Line | Constant                 | Value | Purpose                     |
| ---- | ------------------------ | ----- | --------------------------- |
| 18   | `FLIGHT_DAY`             | 0     | Flight day constant         |
| 19   | `ARRIVAL_DAY`            | 1     | Arrival day constant        |
| 22   | `EARLY_FLIGHT_THRESHOLD` | 0.33  | Early flight phase fraction |
| 23   | `MID_FLIGHT_THRESHOLD`   | 0.66  | Mid flight phase fraction   |

### Actuals & Tracking (`actuals-utils.ts`)

| Line | Constant                    | Value | Purpose                     |
| ---- | --------------------------- | ----- | --------------------------- |
| 40   | `TWELVE_HOURS_MINUTES`      | 720   | Midnight crossing detection |
| 42   | `TWENTY_FOUR_HOURS_MINUTES` | 1440  | Deviation calculation       |

### Storage & Persistence

| File                  | Line | Constant         | Value                    | Purpose                  |
| --------------------- | ---- | ---------------- | ------------------------ | ------------------------ |
| `short-code.ts`       | 8    | `BASE62`         | `[a-zA-Z0-9]` (62 chars) | Share code character set |
| `schedule-storage.ts` | 9    | `FORM_STATE_KEY` | "dawnward_form_state"    | localStorage key         |
| `trip-status.ts`      | 1    | `MS_PER_DAY`     | 86400000                 | Milliseconds per day     |

### Demo/Example Values (`trip-form.tsx`)

| Line | Value   | Purpose                    |
| ---- | ------- | -------------------------- |
| 86   | +2 days | "Show me" departure offset |
| 87   | "20:45" | "Show me" departure time   |
| 90   | +3 days | "Show me" arrival offset   |
| 91   | "15:15" | "Show me" arrival time     |
| 103  | 500ms   | Scroll timeout             |

### Color Schemes (`preference-colors.ts`)

| Scheme    | Usage              | Primary Color |
| --------- | ------------------ | ------------- |
| `emerald` | Melatonin          | emerald-500   |
| `orange`  | Caffeine           | orange-500    |
| `sky`     | Exercise/Intensity | sky-500       |
| `purple`  | Nap/Prep days      | purple-500    |
| `amber`   | Light exposure     | amber-500     |

### Design System (`intervention-utils.ts`)

Already well-organized with `getInterventionStyle()` function providing semantic colors for all intervention types.

---

## MCP (Model Context Protocol) Constants

### API Route (`src/app/api/mcp/route.ts`)

| Line | Constant        | Value | Purpose                  |
| ---- | --------------- | ----- | ------------------------ |
| 32   | `RATE_LIMIT`    | 100   | Requests per hour per IP |
| 33   | `MAX_BODY_SIZE` | 64KB  | Request body limit       |

### Python Tools Endpoint (`api/mcp/tools.py`)

| Line | Constant          | Value   | Purpose                             |
| ---- | ----------------- | ------- | ----------------------------------- |
| 24   | `MAX_BODY_SIZE`   | 64KB    | Request body limit                  |
| 25   | `INTERNAL_SECRET` | env var | Internal auth (MCP_INTERNAL_SECRET) |

### Type Definitions (`src/lib/mcp/types.ts`)

| Line  | Constant              | Value  | Purpose                     |
| ----- | --------------------- | ------ | --------------------------- |
| 35-43 | `JSON_RPC_ERRORS`     | object | Standard JSON-RPC 2.0 codes |
| 132   | `MAX_TIMEZONE_LENGTH` | 64     | IANA timezone validation    |

**JSON_RPC_ERRORS values:**

```typescript
PARSE_ERROR: -32700,
INVALID_REQUEST: -32600,
METHOD_NOT_FOUND: -32601,
INVALID_PARAMS: -32602,
INTERNAL_ERROR: -32603,
RATE_LIMIT_EXCEEDED: -32001,  // Custom
```

---

## Rate Limiting Constants

### Rate Limiter (`src/lib/rate-limiter.ts`)

| Line | Constant           | Value   | Purpose                      |
| ---- | ------------------ | ------- | ---------------------------- |
| 9    | `ONE_HOUR_MS`      | 3600000 | 1 hour in milliseconds       |
| 16   | `CLEANUP_INTERVAL` | 1000    | Requests before cleanup runs |
| 19   | `MAX_TRACKED_IPS`  | 10000   | Memory protection limit      |

### IP Utilities (`src/lib/ip-utils.ts`)

| Line | Constant       | Value | Purpose         |
| ---- | -------------- | ----- | --------------- |
| 8    | `IPV4_PATTERN` | regex | IPv4 validation |
| 9    | `IPV6_PATTERN` | regex | IPv6 validation |

---

## Database Schema (Existing User Preferences)

From `prisma/schema.prisma`, the User model has:

```prisma
// Schedule generation preferences (10 fields)
defaultPrepDays      Int     @default(3)
defaultWakeTime      String  @default("07:00")
defaultSleepTime     String  @default("23:00")
usesMelatonin        Boolean @default(true)
usesCaffeine         Boolean @default(true)
usesExercise         Boolean @default(false)
napPreference        String  @default("flight_only")
scheduleIntensity    String  @default("balanced")
caffeineCutoffHours  Int     @default(8)
lightExposureMinutes Int     @default(60)

// Display preferences (3 fields)
showDualTimezone     Boolean @default(false)
// scheduleViewMode removed — now viewport-driven (desktop=expanded, mobile=collapsed)
use24HourFormat      Boolean @default(false)
```

### Implementation Status

| Field                | Schema | Types | API | UI  | Status  |
| -------------------- | ------ | ----- | --- | --- | ------- |
| defaultWakeTime      | ✅     | ✅    | ✅  | ✅  | Working |
| defaultSleepTime     | ✅     | ✅    | ✅  | ✅  | Working |
| defaultPrepDays      | ✅     | ✅    | ✅  | ✅  | Working |
| usesMelatonin        | ✅     | ✅    | ✅  | ✅  | Working |
| usesCaffeine         | ✅     | ✅    | ✅  | ✅  | Working |
| usesExercise         | ✅     | ✅    | ✅  | ✅  | Working |
| napPreference        | ✅     | ✅    | ✅  | ✅  | Working |
| scheduleIntensity    | ✅     | ✅    | ✅  | ✅  | Working |
| caffeineCutoffHours  | ✅     | ✅    | ✅  | ✅  | Working |
| lightExposureMinutes | ✅     | ✅    | ✅  | ✅  | Working |
| showDualTimezone     | ✅     | ✅    | ✅  | ✅  | Working |
| scheduleViewMode     | —      | —     | —   | —   | Removed (viewport-driven) |
| use24HourFormat      | ✅     | ✅    | ✅  | ✅  | Working |

### Future Preference Candidates (Not Yet Implemented)

| Field                   | Default | Purpose                 |
| ----------------------- | ------- | ----------------------- |
| `maxNapMinutes`         | 30      | Standard nap cap        |
| `maxNapWithDebtMinutes` | 90      | High-debt nap cap       |
| `arrivalNapCutoffTime`  | "13:00" | Latest arrival nap time |
| `melatoninDoseMg`       | 0.5     | Melatonin dose          |

---

## Configuration Duplication Issues

### Intensity Rates (Fixed)

The schedule intensity rates are defined in `shift_calculator.py`:

| Location                    | Type             | Content                                        |
| --------------------------- | ---------------- | ---------------------------------------------- |
| `shift_calculator.py:51-64` | Code (canonical) | `INTENSITY_CONFIGS` dict - **source of truth** |
| `types.py:86-87`            | Comments         | Cross-reference to canonical source (fixed)    |
| `test_shift_rates.py:44-57` | Test assertions  | Hardcoded values (validates code - correct)    |

**Status:** Fixed. `types.py` now references `shift_calculator.py` instead of duplicating rate values.

---

## Why Not Centralize?

After code-simplifier analysis (January 2026), we decided **against** creating central config files:

| Consideration        | Assessment                                                            |
| -------------------- | --------------------------------------------------------------------- |
| **Coupling**         | Central config creates imports between otherwise independent modules  |
| **Cohesion**         | Constants are clearer when co-located with their usage                |
| **Scale**            | ~35 algorithm constants across 5 files doesn't justify infrastructure |
| **Tuning frequency** | These are science-derived values, rarely changed                      |

The current pattern of **module-level named constants** is appropriate for this codebase.
Constants are already discoverable via this audit document.

---

## Summary

| Category              | Count | Action                                              |
| --------------------- | ----- | --------------------------------------------------- |
| Immutable Science     | ~36   | Leave as-is, document sources                       |
| Algorithm Config      | ~42   | Keep as module-level constants (decided)            |
| User Preferences      | 13    | All working, 4 future candidates                    |
| Frontend Defaults     | ~26   | Mostly centralized, well-organized                  |
| Shift & Prep Days     | 4     | Prep day calculation thresholds                     |
| Schedule View         | 4     | UI timing and display thresholds                    |
| Calendar Integration  | ~22   | Event density, durations, reminders, sleep handling |
| Flight Phase          | 4     | Flight day timing fractions                         |
| Actuals & Tracking    | 2     | Deviation calculation constants                     |
| Storage & Persistence | 3     | localStorage keys and time constants                |
| MCP Constants         | ~12   | New endpoint for AI integrations                    |
| Rate Limiting         | ~5    | Memory-safe sliding window implementation           |
| Duplication           | 0     | Fixed (types.py now cross-references)               |

### Priority Actions

1. **Nap settings** (duration, windows, cutoff) - moderate user value
2. **Melatonin dose** (0.3-3mg) - low priority, safety consideration

---

_Last updated: February 2, 2026_
