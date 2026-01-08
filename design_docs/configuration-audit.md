# Configuration Audit: Hardcoded Constants & User Preference Candidates

## Goal
Document all hardcoded constants in the codebase, categorize them, and identify candidates for:
1. Centralized system configuration
2. User-configurable preferences (future work)

---

## Python Backend Constants

### Category 1: Immutable Science Constants (DO NOT CHANGE)
These are from peer-reviewed circadian research. Changing breaks the Forger99 model.

| File | Constant | Value | Source |
|------|----------|-------|--------|
| `markers.py:23-25` | `CBTMIN_BEFORE_WAKE` | 2.5h | Czeisler & Gooley 2007 |
| | `DLMO_BEFORE_SLEEP` | 2.0h | Burgess et al. 2010 |
| | `DLMO_TO_CBTMIN` | 6.0h | Core circadian relationship |
| `prc.py:30-40` | Light PRC zones | 0-4h advance, -4-0h delay | Khalsa 2003 |
| | `MAX_ADVANCE_PER_DAY` | 2.0h | Khalsa 2003 |
| | `MAX_DELAY_PER_DAY` | 3.4h | Khalsa 2003 |
| `prc.py:165-170` | Melatonin PRC | -5h advance, +10h delay | Burgess 2010 |
| `sleep_pressure.py:24-31` | Two-Process Model | 90min cycles, 16h wake | Borbély |
| `shift_calculator.py:36-40` | Shift rate limits | 1.0-2.0h/day | Physiological limits |

### Category 2: Algorithm Configuration (Could Centralize)
System behavior that could move to a config file.

| File | Constant | Value | Purpose |
|------|----------|-------|---------|
| `phase_generator.py:32` | `PRE_DEPARTURE_BUFFER_HOURS` | 3.0 | Airport arrival buffer |
| `phase_generator.py:33` | `ULR_FLIGHT_THRESHOLD_HOURS` | 12.0 | Ultra-long-range flight classification |
| `phase_generator.py:145-147` | Layover thresholds | 48h, 96h | Multi-leg strategy |
| `constraint_filter.py:20` | `SLEEP_TARGET_DEPARTURE_BUFFER_HOURS` | 4.0 | Filter sleep targets near departure |
| `constraint_filter.py:187` | Early morning threshold | 6h | Arrival filtering |
| `scheduler_v2.py:203` | Past intervention buffer | 30min | Grace period for filtering |

### Category 3: User Preference Candidates
**Priority items for future user settings:**

#### Light Exposure Duration
| File | Value | Current | Range | Notes |
|------|-------|---------|-------|-------|
| `prc.py:46` | Default duration | 60 min | 30-120 min | Research supports variable |
| `intervention_planner.py:251` | Short phase duration | 30 min | 15-60 min | Quick interventions |
| `intervention_planner.py:347` | Standard duration | 60 min | 30-120 min | Main light exposure |

#### Caffeine Cutoff
| File | Value | Current | Range | Notes |
|------|-------|---------|-------|-------|
| `intervention_planner.py:502` | Cutoff before sleep | 600 min (10h) | 480-720 min (8-12h) | Half-life ~6h |

#### Nap Settings
| File | Value | Current | Range | Notes |
|------|-------|---------|-------|-------|
| `sleep_pressure.py:34-37` | Nap window start/end | 30-50% into day | 25-60% | When naps are allowed |
| `sleep_pressure.py:144` | Max nap (high debt) | 90 min | 60-120 min | One sleep cycle |
| `sleep_pressure.py:149` | Max nap (standard) | 30 min | 20-45 min | Avoid inertia |
| `sleep_pressure.py:194` | Arrival nap cutoff | 13:00 | Flexible | Hard limit time |
| `sleep_pressure.py:208` | Settle-in after arrival | 45 min | 30-90 min | Rest before nap |
| `sleep_pressure.py:219-221` | Debt thresholds | 5h/3h | Adjustable | Nap urgency triggers |
| `intervention_planner.py:538` | Default sleep debt | 4.0h | 2-6h | Red-eye assumption |

#### Melatonin Dose
| File | Value | Current | Range | Notes |
|------|-------|---------|-------|-------|
| `intervention_planner.py:447,470` | Dose | 0.5mg | 0.3-3mg | Burgess recommends 0.5mg |

---

## TypeScript Frontend Constants

### Already Centralized
**File:** `src/types/trip-form.ts:39-51`
```typescript
export const defaultFormState: TripFormState = {
  wakeTime: "07:00",      // User preference
  sleepTime: "22:00",     // User preference
  prepDays: 3,            // User preference
  useMelatonin: true,     // User preference
  useCaffeine: true,      // User preference
  useExercise: false,     // User preference
  napPreference: "flight_only",  // User preference
};
```

### Could Centralize
| File | Value | Purpose |
|------|-------|---------|
| `time-select.tsx:32` | 15 min | Time picker increment |
| `trip-form.tsx:74-79` | +2/+3 days | Demo date offsets |
| `route.ts:179` | 30000ms | API timeout |
| `route.ts:82` | 1-7 | Prep days validation range |
| `day-section.tsx:48` | 6h | Late-night sleep threshold |

### Design System (Intervention Colors)
Already well-organized in `intervention-utils.ts:11-107` with `getInterventionStyle()`.

---

## Database Schema (Existing User Preferences)

From `prisma/schema.prisma`, users table already has:
```prisma
default_prep_days     Int       @default(3)
default_wake_time     String    @default("07:00")
default_sleep_time    String    @default("23:00")
uses_melatonin        Boolean   @default(true)
uses_caffeine         Boolean   @default(true)
nap_preference        String    @default("flight_only")
```

**Missing from schema (future additions):**
- `light_exposure_minutes` (default 60)
- `caffeine_cutoff_hours` (default 10)
- `max_nap_minutes` (default 30)
- `max_nap_with_debt_minutes` (default 90)
- `arrival_nap_cutoff_time` (default "13:00")
- `melatonin_dose_mg` (default 0.5)

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

| Category | Count | Action |
|----------|-------|--------|
| Immutable Science | ~28 | Leave as-is, document sources |
| Algorithm Config | ~10 | Could centralize (low priority) |
| User Preferences | ~15 | Add to DB schema + settings UI (high priority) |
| Frontend Defaults | ~7 | Already mostly centralized |

**Priority User Preferences to Add:**
1. Light exposure duration (30-120 min)
2. Caffeine cutoff (8-12h before sleep)
3. Nap settings (duration, windows, cutoff)
4. Melatonin dose (0.3-3mg)
