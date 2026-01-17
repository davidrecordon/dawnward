# Timezone Rearchitecture

> **Status**: Exploration/RFC
> **Location**: `design_docs/exploration/timezone-rearchitecture.md`

## Problem Statement

The dual timezone feature work revealed complexity in how departure vs. arrival vs. in-flight time handling works. Current architecture has timezone logic distributed across Python scheduler and TypeScript frontend, with the frontend "monkey-patching" timezone context in several places:

1. **Pre-landing detection** (day-section.tsx:163-181) - Frontend marks arrival-day items before landing as in-transit
2. **Dual timezone calculation** (intervention-utils.ts:272-338) - Frontend calculates origin/dest times from departure + offset
3. **Timezone propagation** (schedule-utils.ts:66-153) - Frontend copies DaySchedule timezone onto each Intervention

This distribution creates risk for:

- Inconsistent timezone handling across layers
- Difficulty testing timezone correctness
- Calendar sync accuracy (events need UTC times)

## Proposed Solution: Explicit Timezone Context

**Core Principle**: Every intervention should carry complete timezone metadata from Python, making it self-describing for any consumer (UI, calendar API, testing).

### Enhanced Intervention Type

```python
@dataclass
class Intervention:
    # Standard fields
    type: InterventionType
    title: str
    description: str
    duration_min: int | None = None

    # Time in both timezones (frontend picks which to display)
    origin_time: str                    # "HH:MM" in origin timezone
    dest_time: str                      # "HH:MM" in destination timezone
    origin_date: str                    # "YYYY-MM-DD" in origin timezone
    dest_date: str                      # "YYYY-MM-DD" in destination timezone

    # Trip timezone context (always present)
    origin_tz: str                      # Trip's origin IANA timezone
    dest_tz: str                        # Trip's destination IANA timezone

    # Phase info
    phase_type: PhaseType               # Which phase this belongs to
    show_dual_timezone: bool = False         # True = display both origin and dest times

    # Nap window fields (UTC - frontend converts for display)
    window_end_utc: str | None = None   # ISO 8601 UTC
    ideal_time_utc: str | None = None   # ISO 8601 UTC

    # In-flight sleep windows only
    flight_offset_hours: float | None = None  # Pre-computed hours into flight (e.g., 4.5)
```

Note: UTC can be derived from `origin_time + origin_date + origin_tz` when needed (e.g., calendar sync). No need to store it separately.

### Key Changes

| What                           | Current                          | Proposed                                       |
| ------------------------------ | -------------------------------- | ---------------------------------------------- |
| Time                           | Single `time` field              | `origin_time` + `dest_time`                    |
| Date                           | DaySchedule.date (single)        | `origin_date` + `dest_date`                    |
| Trip timezones                 | ScheduleResponse only            | Every Intervention has `origin_tz` + `dest_tz` |
| Nap window times               | Local `window_end`, `ideal_time` | UTC: `window_end_utc`, `ideal_time_utc`        |
| Dual timezone trigger          | Frontend (day-section.tsx)       | Python scheduler sets `show_dual_timezone`     |
| Phase type                     | DaySchedule.phase_type           | Intervention.phase_type                        |
| DaySchedule.timezone           | Present                          | Removed (redundant)                            |
| DaySchedule.show_dual_timezone | Present                          | Removed (redundant)                            |

## Benefits

### Correctness

- Single source of truth (Python scheduler)
- Eliminates timezone derivation bugs in frontend
- UTC timestamps enable accurate calendar sync

### Testability

- Python tests validate complete timezone context
- Can assert pre-landing items are marked correctly
- No frontend logic to test for timezone correctness

### Calendar Sync Readiness

- `utc_datetime` directly usable for Google Calendar API
- `timezone` field specifies display timezone for calendar invite
- No conversion logic needed at calendar sync time

### Maintainability

- ~200 lines of frontend timezone logic removed
- No FlightContext prop drilling
- Self-describing interventions (inspect one item, understand its context)

## Implementation Approach

### Python Changes

1. **types.py** - Modify `Intervention` and `DaySchedule` dataclasses:

   Replace on `Intervention`:
   - `time` → `origin_time: str` + `dest_time: str`
   - `window_end` → `window_end_utc: str | None`
   - `ideal_time` → `ideal_time_utc: str | None`

   Add to `Intervention`:
   - `origin_tz: str` (required)
   - `dest_tz: str` (required)
   - `origin_date: str` (required)
   - `dest_date: str` (required)
   - `phase_type: PhaseType` (required)
   - `show_dual_timezone: bool = False`

   Remove from `DaySchedule`:
   - `timezone`
   - `show_dual_timezone`

2. **Add `FlightContext` dataclass** to types.py (internal to scheduler):

   ```python
   @dataclass
   class FlightContext:
       """Flight timing - used internally for pre-landing detection and offset calculation."""
       departure_utc: str  # ISO 8601 UTC
       arrival_utc: str    # ISO 8601 UTC
   ```

   Timezones removed (already on every Intervention). Only the UTC timestamps are needed for:
   - Pre-landing detection: `intervention_utc < arrival_utc`
   - Flight offset: `intervention_utc - departure_utc`

3. **intervention_planner.py** - Update all intervention creation to use a helper:
   - Add `_build_intervention()` that accepts phase context
   - Computes UTC datetime from local time + phase timezone
   - Sets all timezone metadata fields

4. **scheduler_v2.py** - Add `_enrich_with_timezone_context()` that:
   - Validates `origin_tz` and `dest_tz` are valid IANA timezones (fail fast on bad airport data)
   - Computes FlightContext from first leg
   - Computes `origin_time`, `dest_time`, `origin_date`, `dest_date` for each intervention
   - For post_arrival phase items, check if intervention time < arrival time
   - Set `show_dual_timezone=True` for in-flight and pre-landing items

### Frontend Changes

1. **schedule.ts** - Update `Intervention` and `DaySchedule` interfaces:

   Replace on `Intervention`:
   - `time` → `origin_time: string` + `dest_time: string`
   - `window_end` → `window_end_utc?: string`
   - `ideal_time` → `ideal_time_utc?: string`

   Add to `Intervention`:
   - `origin_tz`, `dest_tz`, `origin_date`, `dest_date`, `phase_type` (required)
   - `show_dual_timezone` (boolean, default false)

   Remove from `DaySchedule`:
   - `timezone`
   - `show_dual_timezone`

   Add helpers:
   - `getDisplayTime(i): string` → `origin_time` or `dest_time` based on `phase_type`
   - `formatUtcInTimezone(utc, tz): string` → for nap window times

2. **intervention-utils.ts** - Simplify dual timezone display:
   - Use `intervention.origin_time` and `intervention.dest_time` directly
   - Delete FlightContext parameter and all derivation logic

3. **day-section.tsx** - Remove pre-landing detection entirely:
   - Delete lines 163-181 (pre-landing detection logic)
   - Read `show_dual_timezone` directly from intervention
   - Remove `flightContext` computation and prop

4. **schedule-utils.ts** - Simplify `mergePhasesByDate()`:
   - Remove timezone propagation loop
   - Keep phase ordering logic only

5. **Component prop cleanup**:
   - Remove FlightContext from intervention-card.tsx
   - Remove FlightContext from inflight-sleep-card.tsx
   - Remove FlightContext from grouped-item-card.tsx

### Schedule Regeneration Script

Create a reusable script that regenerates schedules using the latest scheduling logic. This serves multiple purposes:

1. **Initial migration**: Backfill all existing `SharedSchedule` records with new timezone fields
2. **Validation**: Detect and flag schedules with data issues (missing fields, invalid timezones, etc.)
3. **Future use**: Re-run after scheduler improvements to update stored schedules

**Script location**: `scripts/regenerate-schedules.ts`

**Features**:

- `--all` flag to regenerate all future trips (departure > now)
- `--id <id>` flag to regenerate a specific trip
- `--dry-run` flag to validate without writing
- `--validate-only` flag to check for issues without regenerating
- Logs validation errors (missing fields, parse failures, timezone mismatches)
- Preserves original `createdAt` timestamp
- Updates `schedule` JSON field with fresh output from Python scheduler

**Validation checks**:

- All interventions have required fields (`origin_time`, `dest_time`, `origin_date`, `dest_date`, `origin_tz`, `dest_tz`, `phase_type`)
- `origin_tz` and `dest_tz` are valid IANA timezones (catch typos in airport data early)
- `origin_time` + `origin_date` + `origin_tz` represents the same moment as `dest_time` + `dest_date` + `dest_tz`
- DST validity: times like 2:30 AM on spring-forward days don't exist—flag if scheduler produces them
- Nap windows have valid `window_end_utc` and `ideal_time_utc` (ISO 8601)
- In-flight sleep windows have `flight_offset_hours` set
- Phase types are valid
- No interventions scheduled during flight (except sleep windows)

**Migration plan**:

1. Deploy new scheduler code (Python + TypeScript)
2. Run `bun scripts/regenerate-schedules.ts --dry-run --all` to validate
3. Run `bun scripts/regenerate-schedules.ts --all` to migrate
4. Spot-check a few trips in the UI

## Testing Strategy

### Python Tests

New file: `api/_python/circadian/tests/test_timezone_context.py`

```python
def test_intervention_has_complete_timezone_context():
    """Every intervention should carry times, dates, timezones, phase."""
    response = generate_schedule_v2(request)
    for day in response.interventions:
        for item in day.items:
            assert item.origin_time is not None
            assert item.dest_time is not None
            assert item.origin_date is not None
            assert item.dest_date is not None
            assert item.origin_tz is not None
            assert item.dest_tz is not None
            assert item.phase_type is not None
            assert isinstance(item.show_dual_timezone, bool)

def test_pre_landing_items_show_dual_timezone():
    """Arrival-day items before landing should have show_dual_timezone=True."""
    # SFO→LHR overnight flight, landing 10:30 AM local
    # Wake target at 8:00 AM (before landing) needs dual timezone display
    ...

def test_inflight_items_have_offset():
    """In-flight sleep windows should have flight_offset_hours set."""
    ...
```

### TypeScript Tests

Update existing tests in `src/lib/__tests__/intervention-utils.test.ts`:

```typescript
describe("formatInFlightDualTimezones", () => {
  it("uses intervention.utc_datetime directly", () => {
    // No complex departure + offset calculation
    // Just format UTC moment in two timezones
  });
});
```

## Trade-offs

| Trade-off            | Decision                                                    | Rationale                                                                      |
| -------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Payload size         | ~100 bytes extra per intervention                           | Correctness and simplicity outweigh bandwidth                                  |
| Dual time/date       | Store both origin and dest even though one is usually shown | Enables dual display without frontend timezone math                            |
| Local-first          | Store local times, derive UTC when needed                   | Display is local; calendar sync can derive UTC                                 |
| Nap windows in UTC   | `window_end_utc`, `ideal_time_utc` stored as UTC            | These span timezones; frontend converts for display                            |
| DaySchedule slimming | Remove timezone/show_dual_timezone from DaySchedule         | Each intervention is self-describing; DaySchedule is just a grouping container |

## Files to Create/Modify

### New Files

- `api/_python/circadian/tests/test_timezone_context.py` - Timezone context tests
- `scripts/regenerate-schedules.ts` - Reusable schedule regeneration and validation script

### Modified Files

**Python:**

- `api/_python/circadian/types.py` - Add fields to Intervention, add FlightContext
- `api/_python/circadian/scheduling/intervention_planner.py` - Build interventions with context
- `api/_python/circadian/scheduler_v2.py` - Pre-landing detection, FlightContext setup

**TypeScript:**

- `src/types/schedule.ts` - Update Intervention interface
- `src/lib/intervention-utils.ts` - Simplify dual timezone function, delete FlightContext logic
- `src/lib/schedule-utils.ts` - Remove timezone propagation
- `src/components/schedule/day-section.tsx` - Remove pre-landing detection
- `src/components/schedule/intervention-card.tsx` - Use intervention fields directly
- `src/components/schedule/inflight-sleep-card.tsx` - Use intervention fields directly
- `src/components/schedule/grouped-item-card.tsx` - Remove FlightContext prop

## Decisions

1. **Date field timezone**: Store both `origin_date` and `dest_date` for in-transit items. The whole point of this refactor is to have complete context from the scheduler—no reason to pick one.

2. **DaySchedule simplification**: Remove `timezone` and `show_dual_timezone` from DaySchedule entirely. Section headers don't display timezone, and a single calendar day can span multiple timezones (pre-departure in origin, post-arrival in destination). Each intervention carries its own timezone now.

3. **Multi-leg trips**: Not a concern—this refactor will be completed before the multi-leg feature is merged.

## Verification

After implementation:

1. Run `bun run test:run` - All TypeScript tests pass
2. Run `bun run test:python` - All Python tests pass including new timezone context tests
3. Generate schedule for SFO→LHR overnight flight, verify:
   - Pre-landing items on arrival day show dual timezones
   - Times display correctly in both origin and destination timezones
4. (Future) Create calendar events, verify times appear correct in Google Calendar

## Estimated Scope

**Python (~250 lines changed):**

- `types.py`: Add fields to Intervention, simplify DaySchedule, add FlightContext
- `intervention_planner.py`: Update all Intervention() calls, add timezone computation helper
- `scheduler_v2.py`: Add `_enrich_with_timezone_context()`, compute FlightContext from legs

**TypeScript (~300 lines changed):**

- `schedule.ts`: Update interfaces
- `intervention-utils.ts`: Delete ~100 lines of FlightContext derivation, add simple helpers
- `schedule-utils.ts`: Delete timezone propagation loop
- `day-section.tsx`: Delete pre-landing detection (~20 lines)
- Component props: Remove FlightContext from 3 components

**Migration script (~200 lines):**

- `scripts/regenerate-schedules.ts`: CLI, validation, batch regeneration

**Tests (~150 lines):**

- New Python tests for timezone context validation
- Update TS tests for new field names

**Net effect:** Frontend complexity reduced significantly. Timezone logic consolidated in Python scheduler.
