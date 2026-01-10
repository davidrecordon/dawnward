# Debugging Tips

Lessons learned from debugging Dawnward's circadian scheduler.

## Timezone Calculations

### Always Use UTC for Cross-Timezone Math

**Problem**: Naive datetime subtraction across timezones gives wrong results.

```python
# WRONG: Subtracting local times in different timezones
departure = datetime(2026, 1, 11, 9, 45)   # 9:45 AM PST (local)
arrival = datetime(2026, 1, 12, 19, 10)    # 7:10 PM Singapore (local)
flight_hours = (arrival - departure).total_seconds() / 3600
# Result: 33.4 hours (WRONG - actual flight is ~17h)
```

```python
# CORRECT: Convert both to UTC first
from datetime import UTC
from zoneinfo import ZoneInfo

departure_utc = departure.replace(tzinfo=ZoneInfo("America/Los_Angeles")).astimezone(UTC)
arrival_utc = arrival.replace(tzinfo=ZoneInfo("Asia/Singapore")).astimezone(UTC)
flight_hours = (arrival_utc - departure_utc).total_seconds() / 3600
# Result: 17.4 hours (CORRECT)
```

### Sleep Window Timestamps

When generating sleep windows for in-flight periods:

1. Calculate window times in UTC (relative to departure UTC)
2. Store as UTC ISO strings with timezone info
3. Convert to destination timezone only for display

The intervention planner expects UTC timestamps and will convert for display.

## Constraint Filter Gotchas

### ULR Phases Need Special Handling

In-transit ULR phases have interventions positioned by `flight_offset_hours`, not timezone-local times. The constraint filter's phase bounds check doesn't make sense for these.

**Fix**: Skip phase bounds filtering for `in_transit_ulr` phases.

### `keep_always` vs Phase Bounds

The `keep_always` set in constraint_filter.py protects certain intervention types from being filtered. But this can cause issues if the intervention time is physically impossible (e.g., wake_target after departure).

**Better approach**: Cap unrealistic times at the planner level, not just filter at constraint level.

## Phase Duration and Routing

### Short Phases (< 8h) Use Different Path

```python
if phase.duration_hours < 8:
    return self._plan_single_recommendation(phase, include_sleep_wake=True)
```

If you add logic to `plan_phase()`, remember to also add it to `_plan_single_recommendation()` for short phases like pre_departure.

## Debugging Workflow

### 1. Check Phase Generation First

```python
from circadian.scheduling.phase_generator import PhaseGenerator
phases = generator.generate_phases()
for p in phases:
    print(f"{p.phase_type}: {p.start_datetime} - {p.end_datetime}")
    print(f"  duration: {p.duration_hours:.1f}h")
    print(f"  is_ulr: {p.is_ulr_flight}, sleep_windows: {p.sleep_windows}")
```

### 2. Trace Intervention Planning

```python
from circadian.scheduling.intervention_planner import InterventionPlanner
planner = InterventionPlanner(request, total_shift, direction)
interventions = planner.plan_phase(phase)
print(f"Generated {len(interventions)} interventions")
for i in interventions:
    print(f"  {i.type}: {i.time} ({i.flight_offset_hours})")
```

### 3. Check Constraint Filtering

```python
from circadian.scheduling.constraint_filter import ConstraintFilter
filter = ConstraintFilter()
filtered = filter.filter_phase(interventions, phase, departure_datetime)
print(f"After filtering: {len(filtered)}")
print(f"Violations: {filter.get_detailed_violations()}")
```

### 4. Full Pipeline Debug

```python
from circadian.scheduler_v2 import ScheduleGeneratorV2
scheduler = ScheduleGeneratorV2()
response = scheduler.generate_schedule(request)

# Find specific day/phase
day0 = [d for d in response.interventions if d.day == 0]
in_transit = [d for d in response.interventions if d.is_in_transit]
```

## Common Bugs

### 1. Python None → JavaScript null

Python's `None` becomes `null` in JSON, not `undefined`.

```typescript
// WRONG
if (item.flight_offset_hours !== undefined) { /* never runs for null */ }

// CORRECT
if (item.flight_offset_hours != null) { /* handles both null and undefined */ }
```

### 2. Phase Type String Matching

```python
# in_transit and in_transit_ulr are different types
if phase.phase_type == "in_transit":  # Won't match ULR!
if "in_transit" in phase.phase_type:  # Matches both
if phase.phase_type in ("in_transit", "in_transit_ulr"):  # Explicit
```

### 3. Time Comparisons Across Midnight

```python
# Early morning times (00:00-05:59) need special handling for sorting
if minutes < 6 * 60:
    minutes += 24 * 60  # Treat as "late night" not "early morning"
```

## Test Coverage Lessons

### What Tests Would Have Caught These Bugs

1. **UTC flight duration**: Test that a 17h flight (SFO→SIN) has `flight_duration_hours` < 20
2. **ULR sleep windows**: Test that `flight_offset_hours` is set on nap_window interventions
3. **Wake target capping**: Test that pre_departure wake_target is before departure time
4. **Null vs undefined**: Test with explicit `null` values, not just missing fields

### Debug Scripts → Unit Tests

When you write a debug script that reveals a bug, convert it to a unit test:

```python
# Debug script that found the bug
def debug_ulr_sleep_windows():
    # ... setup ...
    assert len(nap_windows) == 2
    for nap in nap_windows:
        assert nap.flight_offset_hours is not None

# Convert to pytest
def test_ulr_sleep_windows_have_flight_offset_hours():
    # ... same setup ...
    assert len(nap_windows) == 2
    for nap in nap_windows:
        assert nap.flight_offset_hours is not None
```

## Short Phase Intervention Coverage

### `_plan_single_recommendation()` is Minimal by Design

For phases < 8 hours, `_plan_single_recommendation()` is called instead of full planning:

```python
if phase.duration_hours < 8:
    return self._plan_single_recommendation(phase, include_sleep_wake=True)
```

Originally this only added:
- wake_target (for day 0/1)
- sleep_target (for non-pre_departure day 0/1)
- ONE light_seek OR ONE melatonin

**Problem**: Users saw sparse schedules on Flight Day with only one intervention.

**Fix**: Add caffeine guidance to short phases:

```python
# In _plan_single_recommendation()
if self.context.uses_caffeine:
    interventions.extend(self._plan_caffeine(phase, wake_target, sleep_target))
```

### Early Morning Departures Have Zero Pre-Departure Phase

For flights departing at 09:40 AM with wake time 07:00 AM:
- Pre-departure phase: 07:00 → 06:40 (departure - 3h) = **negative duration**
- Phase is effectively skipped
- Interventions appear on day -1 instead of day 0

This is **expected behavior** - there's no actionable time on flight day for early departures.

## Phase Bounds Clamping vs Filtering

### When to Clamp vs Filter

The constraint filter removes interventions outside phase bounds. But light interventions are critical for circadian shifting.

**Old behavior**: Light at 06:30 AM with phase start at 07:00 AM → filtered (removed)

**New behavior**: Clamp light interventions to phase start instead:

```python
clamp_to_start = {"light_seek", "light_avoid"}

if intervention.type in clamp_to_start and i_minutes < phase_start_minutes:
    # Clamp to phase start - suboptimal but actionable
    clamped = Intervention(
        time=format_time(phase.start_datetime.time()),
        type=intervention.type,
        ...
    )
```

**Science impact**: Slightly suboptimal timing, but still beneficial for phase shifting.

## In-Flight Nap Thresholds

### Regular Flights (Non-ULR)

| Flight Duration | Gets Sleep Suggestion? |
|-----------------|------------------------|
| < 6 hours       | No                     |
| 6-12 hours      | Yes (regular nap)      |
| 12+ hours       | Yes (ULR sleep windows)|

The threshold was lowered from 8h to 6h to help users on more overnight flights.

```python
# In _plan_in_transit()
if phase.flight_duration_hours and phase.flight_duration_hours >= 6:
    return self._plan_regular_flight_nap(phase)
```

### Scheduler Phase Skipping

**Problem**: The scheduler was skipping ALL non-ULR in-transit phases, even when they had nap suggestions.

```python
# WRONG: Skips all non-ULR in-transit phases
if phase.phase_type == "in_transit" and not phase.is_ulr_flight:
    continue
```

```python
# CORRECT: Only skip short flights that wouldn't have nap suggestions
if phase.phase_type == "in_transit" and not phase.is_ulr_flight:
    flight_hours = phase.flight_duration_hours or 0
    if flight_hours < 6:
        continue
```

When adding a new intervention to a phase, check BOTH:
1. The intervention planner generates it (`_plan_in_transit()`, etc.)
2. The scheduler doesn't skip the entire phase (`scheduler_v2.py`)

### ULR Flights (12+ hours)

Ultra-long-haul flights get TWO sleep windows calculated based on circadian biology, not just a generic nap suggestion.
