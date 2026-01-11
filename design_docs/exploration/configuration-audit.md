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

| Line | Constant                     | Value | Purpose                         |
| ---- | ---------------------------- | ----- | ------------------------------- |
| 33   | `STANDARD_NAP_START_PERCENT` | 0.30  | 30% into wake period            |
| 34   | `STANDARD_NAP_END_PERCENT`   | 0.50  | 50% into wake period            |
| 35   | `HIGH_DEBT_NAP_START_PERCENT`| 0.25  | Earlier window when sleep-deprived |
| 36   | `HIGH_DEBT_NAP_END_PERCENT`  | 0.55  | Wider window when sleep-deprived |
| 192  | Arrival nap cutoff           | 13:00 | 1:00 PM hard cutoff             |
| 206  | Settle-in time               | 45min | Buffer after arrival            |

### Category 2: Algorithm Configuration (Could Centralize)

System behavior that could move to a config file.

#### Phase Generation (`phase_generator.py`)

| Line    | Constant                     | Value | Purpose                                |
| ------- | ---------------------------- | ----- | -------------------------------------- |
| 33      | `PRE_DEPARTURE_BUFFER_HOURS` | 3.0   | Airport arrival buffer                 |
| 34      | `ULR_FLIGHT_THRESHOLD_HOURS` | 12.0  | Ultra-long-range flight classification |
| 181     | Layover threshold (short)    | 48h   | Aim-through strategy                   |
| 183     | Layover threshold (medium)   | 96h   | Partial adaptation                     |
| 369-374 | In-flight sleep windows      | 2h/4h | Window offsets and max durations       |

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

#### Scheduler (`scheduler_v2.py`)

| Line | Constant                 | Value | Purpose                    |
| ---- | ------------------------ | ----- | -------------------------- |
| 112  | Short flight threshold   | 6h    | Skip in-transit < 6h       |
| 198  | Past intervention buffer | 30min | Grace period for filtering |

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
  in_transit_ulr: 2,  // Ultra-long-range flights (12+ hours)
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

| Line | Constant          | Value   | Purpose                           |
| ---- | ----------------- | ------- | --------------------------------- |
| 24   | `MAX_BODY_SIZE`   | 64KB    | Request body limit                |
| 25   | `INTERNAL_SECRET` | env var | Internal auth (MCP_INTERNAL_SECRET) |

### Type Definitions (`src/lib/mcp/types.ts`)

| Line  | Constant              | Value | Purpose                      |
| ----- | --------------------- | ----- | ---------------------------- |
| 35-43 | `JSON_RPC_ERRORS`     | object | Standard JSON-RPC 2.0 codes |
| 132   | `MAX_TIMEZONE_LENGTH` | 64    | IANA timezone validation     |

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

| Line | Constant           | Value    | Purpose                      |
| ---- | ------------------ | -------- | ---------------------------- |
| 9    | `ONE_HOUR_MS`      | 3600000  | 1 hour in milliseconds       |
| 16   | `CLEANUP_INTERVAL` | 1000     | Requests before cleanup runs |
| 19   | `MAX_TRACKED_IPS`  | 10000    | Memory protection limit      |

### IP Utilities (`src/lib/ip-utils.ts`)

| Line | Constant       | Value  | Purpose         |
| ---- | -------------- | ------ | --------------- |
| 8    | `IPV4_PATTERN` | regex  | IPv4 validation |
| 9    | `IPV6_PATTERN` | regex  | IPv6 validation |

---

## Database Schema (Existing User Preferences)

From `prisma/schema.prisma`, the User model has:

```prisma
// Implemented and functional (10 fields)
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

### Future Preference Candidates (Not Yet Implemented)

| Field                   | Default | Purpose                 |
| ----------------------- | ------- | ----------------------- |
| `maxNapMinutes`         | 30      | Standard nap cap        |
| `maxNapWithDebtMinutes` | 90      | High-debt nap cap       |
| `arrivalNapCutoffTime`  | "13:00" | Latest arrival nap time |
| `melatoninDoseMg`       | 0.5     | Melatonin dose          |

---

## Configuration Duplication Issues

### Intensity Rates (Soft Duplication)

The schedule intensity rates are defined in `shift_calculator.py` but documented/hardcoded in multiple other locations:

| Location                    | Type             | Content                                        |
| --------------------------- | ---------------- | ---------------------------------------------- |
| `shift_calculator.py:51-64` | Code (canonical) | `INTENSITY_CONFIGS` dict - **source of truth** |
| `types.py:86-90`            | Comments         | Duplicated rate values in docstring            |
| `test_shift_rates.py:36-38` | Test comments    | Same rates documented                          |
| `test_shift_rates.py:44-57` | Test assertions  | Hardcoded values (expected - validates code)   |

**Risk:** If rates in `INTENSITY_CONFIGS` change, comments become stale. Test assertions would fail (good), but comments would not (bad).

**Recommended fix:** Remove inline rate values from comments in `types.py`, add cross-reference to canonical source.

---

## Recommended Future Config Structure

### Python: `api/_python/circadian/config/`

```
config/
├── science.py          # Immutable PRC/marker constants
├── algorithm.py        # System behavior (buffers, thresholds)
└── defaults.py         # Default user preferences
```

### TypeScript: `src/config/`

```
config/
├── constants.ts        # System constants (timeouts, increments)
├── defaults.ts         # Default form values (merge with trip-form.ts)
└── design-tokens.ts    # Colors, spacing (optional)
```

---

## Summary

| Category          | Count | Action                                          |
| ----------------- | ----- | ----------------------------------------------- |
| Immutable Science | ~36   | Leave as-is, document sources                   |
| Algorithm Config  | ~35   | Could centralize (low priority)                 |
| User Preferences  | 10    | All working, 4 future candidates                |
| Frontend Defaults | ~26   | Mostly centralized, well-organized              |
| MCP Constants     | ~12   | New endpoint for AI integrations                |
| Rate Limiting     | ~5    | Memory-safe sliding window implementation       |
| Duplication       | 1     | Fix soft duplication in intensity rate comments |

### Priority Actions

1. **Nap settings** (duration, windows, cutoff) - moderate user value
2. **Melatonin dose** (0.3-3mg) - low priority, safety consideration

---

_Last updated: January 2026_
