# Phase-Based Scheduler Redesign

**Status:** Implementation Plan
**Created:** January 2026
**Updated:** January 2026 (incorporated decisions from flight-timing-edge-cases.md)
**Estimated Effort:** 6-8 days

---

## Executive Summary

Redesign the scheduler around **travel phases** instead of calendar days. This:
1. Fixes the "activities before landing" and "sleep before departure" bugs
2. Creates clean separation between circadian science and practical constraints
3. Enables better modeling of arrival-day fatigue and in-flight sleep
4. Sets foundation for multi-leg trips and layovers

---

## Architecture Overview

### Current: Day-Based Model

```
Day -2 ──► Day -1 ──► Day 0 ──► Day 1 ──► Day 2
  │          │         │         │         │
  └──────────┴─────────┴─────────┴─────────┘
         All 24h blocks, timezone flip at Day 0→1
```

**Problems:**
- Day 0 generates full schedule, but user leaves mid-day
- Day 1 generates full schedule, but user arrives mid-day
- No awareness of actual flight times
- Filters added as patches (4+ filter methods)

### Proposed: Phase-Based Model

```
┌─────────────────────────────────────────────────────────────────┐
│                    CIRCADIAN SCIENCE LAYER                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ PRC Models  │  │ CBTmin/DLMO │  │ Shift Rate  │              │
│  │ (Light,Mel) │  │ Tracking    │  │ Calculation │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│                                                                  │
│  Pure functions. No flight awareness. Returns optimal times.     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PRACTICAL SCHEDULING LAYER                    │
│                                                                  │
│  Phase Generator ──► Intervention Scheduler ──► Constraint Filter│
│                                                                  │
│  Knows about flights. Calls science layer. Applies constraints.  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                        User Schedule
```

### Phase Types

```python
class PhaseType(Enum):
    PREPARATION = "preparation"      # Days before departure (full days)
    PRE_DEPARTURE = "pre_departure"  # Departure day, before flight
    IN_TRANSIT = "in_transit"        # On the plane (short/medium flights)
    IN_TRANSIT_ULR = "in_transit_ulr"  # Ultra-long-range flight (12+ hours)
    POST_ARRIVAL = "post_arrival"    # Arrival day, after landing
    ADAPTATION = "adaptation"        # Full days at destination
```

### In-Transit Strategy by Flight Duration

Per `flight-timing-edge-cases.md`, in-transit handling varies by flight length:

| Flight Duration | Phase Type | Sleep Strategy |
|-----------------|------------|----------------|
| < 8 hours | `IN_TRANSIT` | Single optional nap |
| 8-12 hours | `IN_TRANSIT` | One structured sleep window |
| **12+ hours** | `IN_TRANSIT_ULR` | **Two sleep windows, timed to circadian position** |

For ultra-long-range flights, we model sleep strategically based on:
- User's CBTmin position throughout the flight
- Avoiding the wake maintenance zone
- Ensuring user is awake for landing

### Example: SFO→LHR (Depart 20:45, Arrive 15:15+1) — 10.5h flight

| Phase | Date | Start | End | Timezone | Interventions |
|-------|------|-------|-----|----------|---------------|
| PREPARATION | Jan 13 | 07:00 | 22:00 | PST | Full schedule |
| PREPARATION | Jan 14 | 06:00 | 21:00 | PST | Full schedule |
| PRE_DEPARTURE | Jan 15 | 05:00 | 17:45 | PST | Limited (stop 3h before flight) |
| IN_TRANSIT | Jan 15-16 | 20:45 | 15:15 | — | One sleep window (~4h) |
| POST_ARRIVAL | Jan 16 | 15:15 | 22:00 | GMT | Recovery mode |
| ADAPTATION | Jan 17 | 07:30 | 22:30 | GMT | Full schedule |
| ADAPTATION | Jan 18 | 07:00 | 22:00 | GMT | Full schedule |

### Example: SFO→SIN (Depart 09:40, Arrive 19:05+1) — 17.4h ULR flight

| Phase | Date | Start | End | Timezone | Interventions |
|-------|------|-------|-----|----------|---------------|
| PREPARATION | Jan 13 | 07:00 | 23:00 | PST | Full schedule |
| PRE_DEPARTURE | Jan 14 | 07:00 | 06:40 | PST | Limited (stop 3h before flight) |
| IN_TRANSIT_ULR | Jan 14-15 | 09:40 | 19:05 | — | **Two sleep windows** (~4h each) |
| POST_ARRIVAL | Jan 15 | 19:05 | 23:00 | SGT | Recovery mode (evening arrival) |
| ADAPTATION | Jan 16+ | ... | ... | SGT | Full schedule |

---

## Implementation Phases

### Phase 1: Science Layer Extraction (Day 1-2)

**Goal:** Extract pure circadian science into a clean, testable layer.

#### 1.1 Create `circadian/science/` module

```
api/_python/circadian/
├── science/                    # NEW: Pure science layer
│   ├── __init__.py
│   ├── prc.py                  # Phase Response Curves (light, melatonin)
│   ├── markers.py              # CBTmin, DLMO estimation and tracking
│   ├── shift_calculator.py     # Optimal shift rate calculations
│   └── sleep_pressure.py       # Two-Process Model (Process S)
├── scheduling/                 # NEW: Practical scheduling layer
│   ├── __init__.py
│   ├── phase_generator.py      # Generate phases from flight legs
│   ├── intervention_planner.py # Plan interventions for each phase
│   └── constraint_filter.py    # Apply practical constraints
├── scheduler.py                # REFACTOR: Orchestrates science + scheduling
└── types.py                    # EXTEND: Add Phase types
```

#### 1.2 Extract PRC logic

Move from `light_prc.py`, `melatonin_prc.py` → `science/prc.py`:

```python
# science/prc.py

class LightPRC:
    """Khalsa et al. (2003) Phase Response Curve for light."""

    ADVANCE_ZONE_START = 0    # Hours after CBTmin
    ADVANCE_ZONE_END = 4      # Hours after CBTmin
    DELAY_ZONE_START = -4     # Hours before CBTmin
    DELAY_ZONE_END = 0        # Hours before CBTmin

    @staticmethod
    def optimal_light_time(
        cbtmin: time,
        direction: Literal["advance", "delay"],
        shift_magnitude: float
    ) -> Tuple[time, time]:
        """
        Calculate optimal light exposure window.

        Returns (start_time, end_time) for maximum phase shift effect.
        Pure science - no flight awareness.
        """
        pass

    @staticmethod
    def light_sensitivity(hours_from_cbtmin: float) -> float:
        """
        Return relative sensitivity (0-1) at given time.

        Peak sensitivity at CBTmin, decreasing toward edges of zones.
        """
        pass


class MelatoninPRC:
    """Burgess et al. (2010) Phase Response Curve for melatonin."""

    @staticmethod
    def optimal_melatonin_time(
        dlmo: time,
        direction: Literal["advance", "delay"]
    ) -> time:
        """
        Calculate optimal melatonin timing.

        Advance: 4-6h before DLMO (afternoon)
        Delay: Upon waking (morning) - rarely recommended
        """
        pass
```

#### 1.3 Create CBTmin tracker

Currently we estimate CBTmin once and assume it's static. Science says it shifts during adaptation.

```python
# science/markers.py

class CircadianMarkerTracker:
    """
    Track CBTmin and DLMO as they shift during adaptation.

    Scientific basis:
    - CBTmin shifts ~1-2h/day with optimal light exposure
    - DLMO follows CBTmin with ~14h offset
    """

    def __init__(self, initial_wake: time, initial_sleep: time):
        self.cbtmin = estimate_cbtmin_from_wake(initial_wake)
        self.dlmo = estimate_dlmo_from_sleep(initial_sleep)

    def apply_shift(self, hours: float, direction: str) -> None:
        """Shift markers by given hours in given direction."""
        pass

    def get_cbtmin_at_day(self, day: int, cumulative_shift: float) -> time:
        """Get estimated CBTmin position at given day of adaptation."""
        pass
```

#### 1.4 Add sleep pressure modeling

For arrival-day fatigue handling per design doc:

```python
# science/sleep_pressure.py

class SleepPressureModel:
    """
    Two-Process Model (Borbély 1982) - Process S.

    Sleep pressure:
    - Builds during wakefulness (~linear)
    - Dissipates during sleep (~exponential)
    - Naps partially reset pressure
    """

    def __init__(self, wake_time: time, sleep_time: time):
        self.base_wake_hours = 16  # Typical waking day
        self.pressure = 0.0

    def accumulate(self, wake_hours: float) -> None:
        """Add wake time to pressure."""
        pass

    def dissipate(self, sleep_hours: float, is_nap: bool = False) -> None:
        """Reduce pressure from sleep/nap."""
        pass

    def optimal_nap_window(self) -> Tuple[float, float]:
        """
        Return (earliest_percent, latest_percent) of wake period for nap.

        High pressure → earlier window, longer allowed duration.
        """
        pass

    @property
    def current_debt_hours(self) -> float:
        """Estimated sleep debt in hours."""
        pass
```

---

### Phase 2: Phase Generator (Day 2-3)

**Goal:** Replace day-based iteration with phase-based generation.

#### 2.1 Define Phase types

```python
# types.py (additions)

from dataclasses import dataclass
from datetime import datetime, time
from typing import Literal, Optional, List

PhaseType = Literal["preparation", "pre_departure", "in_transit", "post_arrival", "adaptation"]

@dataclass
class TravelPhase:
    """A distinct phase of the trip with its own scheduling rules."""

    phase_type: PhaseType
    start_datetime: datetime        # Actual start (not midnight)
    end_datetime: datetime          # Actual end (not midnight)
    timezone: str                   # Applicable timezone (None for in_transit)

    # Circadian context
    cumulative_shift: float         # Hours shifted so far
    remaining_shift: float          # Hours left to shift
    day_number: int                 # For backward compatibility with UI

    # Constraints
    available_for_interventions: bool  # False for in_transit

    @property
    def duration_hours(self) -> float:
        """Duration of this phase in hours."""
        return (self.end_datetime - self.start_datetime).total_seconds() / 3600

    @property
    def is_partial_day(self) -> bool:
        """True if phase doesn't span full waking hours."""
        return self.phase_type in ("pre_departure", "post_arrival")
```

#### 2.2 Implement phase generator

```python
# scheduling/phase_generator.py

class PhaseGenerator:
    """Generate travel phases from flight legs."""

    def __init__(
        self,
        legs: List[TripLeg],
        prep_days: int,
        wake_time: str,
        sleep_time: str,
        total_shift: float,
        direction: str
    ):
        self.legs = legs
        self.prep_days = prep_days
        self.wake_time = parse_time(wake_time)
        self.sleep_time = parse_time(sleep_time)
        self.total_shift = total_shift
        self.direction = direction

    def generate_phases(self) -> List[TravelPhase]:
        """
        Generate all phases for the trip.

        For multi-leg trips, strategy depends on layover duration
        (per flight-timing-edge-cases.md).
        """
        if len(self.legs) == 1:
            return self._generate_single_leg_phases()
        else:
            return self._generate_multi_leg_phases()

    def _generate_single_leg_phases(self) -> List[TravelPhase]:
        """Generate phases for a single-leg trip."""
        phases = []

        # 1. Preparation phases (full days before departure)
        phases.extend(self._generate_preparation_phases())

        # 2. Pre-departure phase (departure day, before flight)
        phases.append(self._generate_pre_departure_phase())

        # 3. In-transit phase(s) - depends on flight duration
        phases.extend(self._generate_in_transit_phases())

        # 4. Post-arrival phase (arrival day, after landing)
        phases.append(self._generate_post_arrival_phase())

        # 5. Adaptation phases (full days at destination)
        phases.extend(self._generate_adaptation_phases())

        return phases

    def _generate_multi_leg_phases(self) -> List[TravelPhase]:
        """
        Generate phases for multi-leg trips.

        Strategy per flight-timing-edge-cases.md:
        - Layover < 48h: Aim through to final destination
        - Layover 48-96h: Partial adaptation to layover timezone
        - Layover > 96h: Restart (treat as two separate trips)
        - Opposite directions: Always restart
        """
        strategy = self._calculate_multi_leg_strategy()

        if strategy == "aim_through":
            # Treat as single trip to final destination
            return self._generate_aim_through_phases()
        elif strategy == "partial_adaptation":
            # Some local alignment at layover, maintain trajectory
            return self._generate_partial_adaptation_phases()
        else:  # "restart"
            # Treat as two independent trips
            return self._generate_restart_phases()

    def _calculate_multi_leg_strategy(self) -> str:
        """
        Determine multi-leg strategy based on layover duration and directions.

        Returns: "aim_through", "partial_adaptation", or "restart"
        """
        # Check if directions match (both eastward or both westward)
        directions_match = self._check_leg_directions_match()
        if not directions_match:
            return "restart"  # Opposite directions = must restart

        # Calculate layover duration
        layover_hours = self._calculate_layover_duration()

        if layover_hours < 48:
            return "aim_through"
        elif layover_hours <= 96:
            return "partial_adaptation"
        else:
            return "restart"

    def _check_leg_directions_match(self) -> bool:
        """Check if all legs go the same direction (all east or all west)."""
        directions = []
        for leg in self.legs:
            _, direction = calculate_timezone_shift(
                leg.origin_tz, leg.dest_tz,
                datetime.fromisoformat(leg.departure_datetime)
            )
            directions.append(direction)
        return len(set(directions)) == 1

    def _calculate_layover_duration(self) -> float:
        """Calculate hours between arrival of leg N and departure of leg N+1."""
        if len(self.legs) < 2:
            return 0

        leg1_arrival = datetime.fromisoformat(self.legs[0].arrival_datetime)
        leg2_departure = datetime.fromisoformat(self.legs[1].departure_datetime)
        return (leg2_departure - leg1_arrival).total_seconds() / 3600

    def _generate_pre_departure_phase(self) -> TravelPhase:
        """
        Generate the pre-departure phase.

        Starts at wake time, ends 3 hours before departure
        (time to get to airport, security, etc.)
        """
        leg = self.legs[0]
        departure = datetime.fromisoformat(leg.departure_datetime)

        # Phase ends 3 hours before departure
        buffer_hours = 3.0
        phase_end = departure - timedelta(hours=buffer_hours)

        # Phase starts at wake time on departure day
        phase_start = departure.replace(
            hour=self.wake_time.hour,
            minute=self.wake_time.minute
        )

        # Calculate cumulative shift at this point
        # (This is the sum of all preparation day shifts)
        cumulative = self._calculate_cumulative_shift_at_departure()

        return TravelPhase(
            phase_type="pre_departure",
            start_datetime=phase_start,
            end_datetime=phase_end,
            timezone=leg.origin_tz,
            cumulative_shift=cumulative,
            remaining_shift=self.total_shift - cumulative,
            day_number=0,
            available_for_interventions=True
        )

    def _generate_in_transit_phases(self) -> List[TravelPhase]:
        """
        Generate in-transit phase(s) based on flight duration.

        Per flight-timing-edge-cases.md:
        - < 8h: Single optional nap
        - 8-12h: One structured sleep window
        - 12+h: Two sleep windows timed to circadian position (ULR)
        """
        leg = self.legs[0]
        departure = datetime.fromisoformat(leg.departure_datetime)
        arrival = datetime.fromisoformat(leg.arrival_datetime)
        flight_hours = (arrival - departure).total_seconds() / 3600

        cumulative = self._calculate_cumulative_shift_at_departure()

        if flight_hours >= 12:
            # Ultra-long-range: model two sleep windows
            return self._generate_ulr_transit_phases(
                departure, arrival, cumulative, flight_hours
            )
        else:
            # Standard flight: single phase
            return [TravelPhase(
                phase_type="in_transit",
                start_datetime=departure,
                end_datetime=arrival,
                timezone=None,
                cumulative_shift=cumulative,
                remaining_shift=self.total_shift - cumulative,
                day_number=0,
                available_for_interventions=False,
                # Metadata for sleep planning
                flight_duration_hours=flight_hours,
                sleep_windows=1 if flight_hours >= 8 else 0
            )]

    def _generate_ulr_transit_phases(
        self,
        departure: datetime,
        arrival: datetime,
        cumulative_shift: float,
        flight_hours: float
    ) -> List[TravelPhase]:
        """
        Generate in-transit phases for ultra-long-range flights (12+ hours).

        Models two sleep windows timed to user's circadian position:
        1. Early sleep: ~2h after departure, avoiding wake maintenance zone
        2. Late sleep: ~4h before arrival, ensuring awake for landing
        """
        # Calculate user's CBTmin position at departure
        # (This determines optimal sleep windows)
        cbtmin_at_departure = self._estimate_cbtmin_at_cumulative_shift(cumulative_shift)

        # Sleep window 1: Early in flight (after initial meal service)
        # Avoid scheduling during wake maintenance zone (1-3h before habitual sleep)
        window1_start = departure + timedelta(hours=2)
        window1_duration = min(4.0, flight_hours / 3)  # ~1/3 of flight, max 4h

        # Sleep window 2: Later in flight (before descent)
        # Leave 2h before arrival for meals and landing prep
        window2_end = arrival - timedelta(hours=2)
        window2_duration = min(4.0, flight_hours / 3)
        window2_start = window2_end - timedelta(hours=window2_duration)

        return [TravelPhase(
            phase_type="in_transit_ulr",
            start_datetime=departure,
            end_datetime=arrival,
            timezone=None,
            cumulative_shift=cumulative_shift,
            remaining_shift=self.total_shift - cumulative_shift,
            day_number=0,
            available_for_interventions=False,
            # ULR-specific metadata
            flight_duration_hours=flight_hours,
            sleep_windows=[
                {"start": window1_start, "duration_hours": window1_duration, "label": "Sleep opportunity 1"},
                {"start": window2_start, "duration_hours": window2_duration, "label": "Sleep opportunity 2"},
            ],
            cbtmin_at_departure=cbtmin_at_departure
        )]

    def _generate_post_arrival_phase(self) -> TravelPhase:
        """
        Generate the post-arrival phase.

        Starts at arrival, ends at target bedtime.
        This is the critical "arrival-day fatigue" period from design doc.
        """
        leg = self.legs[-1]  # Last leg for multi-leg trips
        arrival = datetime.fromisoformat(leg.arrival_datetime)

        # Calculate target sleep time for arrival day
        # (Shifted from base sleep time by remaining adaptation needed)
        target_sleep = self._calculate_arrival_day_sleep_target(arrival)

        return TravelPhase(
            phase_type="post_arrival",
            start_datetime=arrival,
            end_datetime=target_sleep,
            timezone=leg.dest_tz,
            cumulative_shift=self._calculate_cumulative_shift_at_arrival(),
            remaining_shift=self.total_shift - self._calculate_cumulative_shift_at_arrival(),
            day_number=1,
            available_for_interventions=True
        )
```

---

### Phase 3: Intervention Planner (Day 3-4)

**Goal:** Plan interventions for each phase by calling into the science layer.

#### 3.1 Create intervention planner

```python
# scheduling/intervention_planner.py

class InterventionPlanner:
    """
    Plan interventions for a phase by querying the science layer.

    Separates "what does science recommend?" from "what's practical?"
    """

    def __init__(
        self,
        science_layer: CircadianScienceLayer,
        user_preferences: UserPreferences
    ):
        self.science = science_layer
        self.prefs = user_preferences

    def plan_phase(self, phase: TravelPhase) -> List[Intervention]:
        """
        Generate interventions for a single phase.

        Calls science layer for optimal times, then constrains to phase bounds.

        Per flight-timing-edge-cases.md, partial days get pro-rated targets:
        - 16+ hours: Full daily target
        - 8-16 hours: 50-100% of target (scaled linearly)
        - < 8 hours: Single high-impact recommendation only
        """
        if not phase.available_for_interventions:
            return self._plan_in_transit(phase)

        # Handle very short phases (< 8h available)
        if phase.duration_hours < 8:
            return self._plan_single_recommendation(phase)

        interventions = []

        # Calculate shift target for this phase (pro-rated for partial days)
        phase_shift_target = self._calculate_phase_shift_target(phase)

        # Get current circadian markers
        cbtmin = self.science.markers.get_cbtmin_at_shift(phase.cumulative_shift)
        dlmo = self.science.markers.get_dlmo_at_shift(phase.cumulative_shift)

        # 1. Light interventions (always)
        light = self._plan_light(phase, cbtmin)
        interventions.extend(light)

        # 2. Melatonin (if enabled)
        if self.prefs.uses_melatonin:
            mel = self._plan_melatonin(phase, dlmo)
            if mel:
                interventions.append(mel)

        # 3. Caffeine (if enabled)
        if self.prefs.uses_caffeine:
            caffeine = self._plan_caffeine(phase)
            interventions.extend(caffeine)

        # 4. Sleep/wake targets
        sleep_wake = self._plan_sleep_wake(phase)
        interventions.extend(sleep_wake)

        # 5. Naps (based on preference and phase type)
        nap = self._plan_nap(phase)
        if nap:
            interventions.append(nap)

        return interventions

    def _calculate_phase_shift_target(self, phase: TravelPhase) -> float:
        """
        Calculate shift target for this phase, pro-rated for partial days.

        Per flight-timing-edge-cases.md:
        - 16+ hours: Full daily target (1h advance / 1.5h delay)
        - 8-16 hours: Scaled linearly (available_hours / 16)
        - < 8 hours: 0 (handled separately with single recommendation)
        """
        base_target = 1.0 if self.prefs.direction == "advance" else 1.5
        available_hours = phase.duration_hours

        if available_hours >= 16:
            return base_target
        elif available_hours >= 8:
            scale = available_hours / 16
            return base_target * scale
        else:
            return 0  # Single recommendation mode

    def _plan_single_recommendation(self, phase: TravelPhase) -> List[Intervention]:
        """
        Plan a single high-impact intervention for very short phases (< 8h).

        Per flight-timing-edge-cases.md: "One good intervention beats rushed multiples."

        Returns the single most impactful intervention based on direction:
        - Advance: Morning light exposure
        - Delay: Evening light exposure or melatonin
        """
        cbtmin = self.science.markers.get_cbtmin_at_shift(phase.cumulative_shift)

        if self.prefs.direction == "advance":
            # Most impactful for advance: morning light after CBTmin
            optimal_time = self.science.prc.light.optimal_light_time(
                cbtmin=cbtmin,
                direction="advance",
                shift_magnitude=phase.remaining_shift
            )[0]

            return [Intervention(
                time=format_time(optimal_time),
                type="light_seek",
                title="Get bright light",
                description=(
                    "Your departure day is short—focus on this one thing. "
                    "Bright morning light helps shift your clock forward."
                ),
                duration_min=30
            )]
        else:
            # Most impactful for delay: evening light or melatonin
            if self.prefs.uses_melatonin:
                dlmo = self.science.markers.get_dlmo_at_shift(phase.cumulative_shift)
                optimal_time = self.science.prc.melatonin.optimal_melatonin_time(
                    dlmo=dlmo, direction="delay"
                )
                return [Intervention(
                    time=format_time(optimal_time),
                    type="melatonin",
                    title="Take melatonin",
                    description=(
                        "Your departure day is short—focus on this one thing. "
                        "Melatonin in the morning helps shift your clock back."
                    ),
                    duration_min=None
                )]
            else:
                # Fall back to evening light
                optimal_time = self.science.prc.light.optimal_light_time(
                    cbtmin=cbtmin,
                    direction="delay",
                    shift_magnitude=phase.remaining_shift
                )[0]
                return [Intervention(
                    time=format_time(optimal_time),
                    type="light_seek",
                    title="Get bright light",
                    description=(
                        "Your departure day is short—focus on this one thing. "
                        "Evening light helps shift your clock back."
                    ),
                    duration_min=30
                )]

    def _plan_light(self, phase: TravelPhase, cbtmin: time) -> List[Intervention]:
        """
        Plan light interventions using PRC.

        Science layer gives optimal window.
        We constrain to phase bounds and waking hours.
        """
        # Get optimal window from science
        optimal_start, optimal_end = self.science.prc.light.optimal_light_time(
            cbtmin=cbtmin,
            direction=self.prefs.direction,
            shift_magnitude=phase.remaining_shift
        )

        # Constrain to phase bounds
        actual_start = max(optimal_start, phase.start_datetime.time())
        actual_end = min(optimal_end, phase.end_datetime.time())

        # If window is too small or outside phase, skip
        if actual_start >= actual_end:
            return []

        # Note any compromise for user feedback
        is_compromised = (actual_start != optimal_start or actual_end != optimal_end)

        return [Intervention(
            time=format_time(actual_start),
            type="light_seek",
            title="Seek bright light",
            description=self._light_description(is_compromised),
            duration_min=self._calculate_duration(actual_start, actual_end)
        )]

    def _plan_nap(self, phase: TravelPhase) -> Optional[Intervention]:
        """
        Plan nap intervention using sleep pressure model.

        Per design doc:
        - Standard nap: 25-50% into wake period, 20-30 min
        - Arrival recovery: Earlier window, up to 90 min, hard cutoff
        """
        if self.prefs.nap_preference == "no":
            return None

        # Get sleep pressure context
        pressure = self.science.sleep_pressure.current_debt_hours

        if phase.phase_type == "post_arrival":
            # Arrival day recovery nap (per design doc)
            return self._plan_arrival_recovery_nap(phase, pressure)
        elif phase.phase_type == "in_transit":
            # In-flight nap (only intervention available)
            return self._plan_in_flight_nap(phase)
        elif self.prefs.nap_preference == "all_days":
            # Standard nap
            return self._plan_standard_nap(phase, pressure)

        return None

    def _plan_arrival_recovery_nap(
        self,
        phase: TravelPhase,
        sleep_debt: float
    ) -> Optional[Intervention]:
        """
        Plan arrival-day recovery nap per design doc.

        - Window start: As soon as practical post-arrival
        - Window end: No later than 1pm local (or 6-8h before target sleep)
        - Max duration: 90 min (one full cycle)
        """
        # Calculate hard cutoff (1pm or 6-8h before sleep)
        one_pm = phase.start_datetime.replace(hour=13, minute=0)
        buffer_before_sleep = 7  # hours
        sleep_cutoff = phase.end_datetime - timedelta(hours=buffer_before_sleep)

        hard_cutoff = min(one_pm, sleep_cutoff)

        # If arrival is after cutoff, no nap (per design doc: "push through")
        if phase.start_datetime >= hard_cutoff:
            return None

        # Nap window starts 30-60 min after arrival (settle in)
        window_start = phase.start_datetime + timedelta(minutes=45)

        return Intervention(
            time=format_time(window_start.time()),
            type="nap_window",
            title="Recovery nap (90 min max)",
            description=(
                f"You'll be tired from the red-eye. A recovery nap helps you function "
                f"while your body adjusts. Hard cutoff: {format_time(hard_cutoff.time())} "
                f"to protect tonight's sleep."
            ),
            duration_min=90
        )
```

---

### Phase 4: Constraint Filter (Day 4-5)

**Goal:** Apply practical constraints as a separate, auditable step.

```python
# scheduling/constraint_filter.py

@dataclass
class ConstraintViolation:
    """Record of a constraint that was applied."""
    intervention_type: str
    original_time: str
    action_taken: Literal["removed", "moved", "shortened"]
    reason: str
    science_impact: str  # How this affects circadian efficacy

class ConstraintFilter:
    """
    Apply practical constraints to planned interventions.

    Records all modifications for transparency/debugging.
    """

    def __init__(self):
        self.violations: List[ConstraintViolation] = []

    def filter_phase(
        self,
        interventions: List[Intervention],
        phase: TravelPhase
    ) -> List[Intervention]:
        """
        Apply all constraints to a phase's interventions.

        Returns filtered list and records violations.
        """
        filtered = interventions.copy()

        # 1. Remove interventions outside phase bounds
        filtered = self._filter_phase_bounds(filtered, phase)

        # 2. Remove interventions during sleep window
        filtered = self._filter_sleep_window(filtered, phase)

        # 3. For partial days, apply special rules
        if phase.is_partial_day:
            filtered = self._filter_partial_day(filtered, phase)

        return filtered

    def _filter_phase_bounds(
        self,
        interventions: List[Intervention],
        phase: TravelPhase
    ) -> List[Intervention]:
        """Remove interventions outside phase start/end times."""
        result = []

        for intervention in interventions:
            i_time = parse_time(intervention.time)

            if i_time < phase.start_datetime.time():
                self.violations.append(ConstraintViolation(
                    intervention_type=intervention.type,
                    original_time=intervention.time,
                    action_taken="removed",
                    reason=f"Before phase start ({phase.start_datetime.time()})",
                    science_impact="Intervention unavailable; phase shift may be slower"
                ))
                continue

            if i_time > phase.end_datetime.time():
                self.violations.append(ConstraintViolation(
                    intervention_type=intervention.type,
                    original_time=intervention.time,
                    action_taken="removed",
                    reason=f"After phase end ({phase.end_datetime.time()})",
                    science_impact="Intervention unavailable; phase shift may be slower"
                ))
                continue

            result.append(intervention)

        return result

    def get_science_impact_summary(self) -> str:
        """
        Summarize how constraints affected circadian efficacy.

        Could be shown to user: "Your schedule achieves ~85% of optimal adaptation"
        """
        if not self.violations:
            return "Full optimal schedule achievable"

        removed = [v for v in self.violations if v.action_taken == "removed"]
        light_removed = [v for v in removed if "light" in v.intervention_type]

        if light_removed:
            return (
                f"{len(light_removed)} light interventions adjusted due to travel constraints. "
                f"Adaptation may take 1-2 extra days."
            )

        return f"{len(removed)} interventions adjusted for practical constraints."
```

---

### Phase 5: Integration & Testing (Day 5-7)

#### 5.1 Refactor main scheduler

```python
# scheduler.py (refactored)

class ScheduleGenerator:
    """
    Generates jet lag adaptation schedules.

    Architecture:
    1. Science layer provides optimal circadian timing
    2. Phase generator creates travel phases from flight legs
    3. Intervention planner queries science for each phase
    4. Constraint filter applies practical limits
    """

    def generate_schedule(
        self,
        request: ScheduleRequest,
        current_datetime: Optional[datetime] = None
    ) -> ScheduleResponse:

        # 1. Initialize science layer with user's baseline
        science = CircadianScienceLayer(
            wake_time=request.wake_time,
            sleep_time=request.sleep_time
        )

        # 2. Calculate total shift and direction
        total_shift, direction = self._calculate_total_shift(request.legs)

        # 3. Generate travel phases
        phase_gen = PhaseGenerator(
            legs=request.legs,
            prep_days=request.prep_days,
            wake_time=request.wake_time,
            sleep_time=request.sleep_time,
            total_shift=total_shift,
            direction=direction
        )
        phases = phase_gen.generate_phases()

        # 4. Plan interventions for each phase
        planner = InterventionPlanner(science, request)
        constraint_filter = ConstraintFilter()

        day_schedules = []
        for phase in phases:
            # Get science-optimal interventions
            interventions = planner.plan_phase(phase)

            # Apply practical constraints
            interventions = constraint_filter.filter_phase(interventions, phase)

            # Sort and package
            interventions = sorted(interventions, key=lambda x: x.time)

            day_schedules.append(DaySchedule(
                day=phase.day_number,
                date=phase.start_datetime.date().isoformat(),
                timezone=phase.timezone or "In transit",
                phase_type=phase.phase_type,  # NEW field
                phase_start=phase.start_datetime.time().isoformat(),  # NEW
                phase_end=phase.end_datetime.time().isoformat(),  # NEW
                items=interventions
            ))

        # 5. Build response (science_impact stored internally, not exposed by default)
        return ScheduleResponse(
            total_shift_hours=abs(total_shift),
            direction=direction,
            estimated_adaptation_days=len([p for p in phases if p.phase_type == "adaptation"]) + 1,
            origin_tz=request.legs[0].origin_tz,
            dest_tz=request.legs[-1].dest_tz,
            interventions=day_schedules,
            _science_impact_internal=constraint_filter.get_science_impact_summary()
        )
```

#### 5.2 Update types for backward compatibility

```python
# types.py (additions)

@dataclass
class DaySchedule:
    """Schedule for a single day/phase."""
    day: int
    date: str
    timezone: str
    items: List[Intervention]

    # New optional fields (backward compatible)
    phase_type: Optional[str] = None
    phase_start: Optional[str] = None
    phase_end: Optional[str] = None

@dataclass
class ScheduleResponse:
    """Complete schedule response."""
    total_shift_hours: float
    direction: str
    estimated_adaptation_days: int
    origin_tz: str
    dest_tz: str
    interventions: List[DaySchedule]

    # science_impact is stored internally but NOT exposed by default
    # Per flight-timing-edge-cases.md decision:
    # - Only surface in "Compare Flights" feature (future scope)
    # - Never phrase as a loss; phrase as timeline ("adapts in X days")
    # - Exception: Warn if arrival time causes antidromic shift risk
    _science_impact_internal: Optional[str] = None

    def get_science_impact(self, context: str = "default") -> Optional[str]:
        """
        Get science impact only in appropriate contexts.

        Args:
            context: "compare_flights", "user_asked", or "default"

        Returns:
            Impact string for compare_flights/user_asked, None for default
        """
        if context in ("compare_flights", "user_asked"):
            return self._science_impact_internal
        return None
```

#### 5.3 Test strategy

```python
# tests/test_phase_based.py

class TestPhaseGenerator:
    """Test phase generation from flight legs."""

    def test_sfo_lhr_phases(self):
        """VS20: SFO 16:30 -> LHR 10:40+1 should produce correct phases."""
        gen = PhaseGenerator(...)
        phases = gen.generate_phases()

        # Should have: prep days + pre_departure + in_transit + post_arrival + adaptation
        assert phases[0].phase_type == "preparation"
        assert phases[-3].phase_type == "pre_departure"
        assert phases[-3].end_datetime.hour == 13  # 3h before 16:30 departure
        assert phases[-2].phase_type == "in_transit"
        assert phases[-1].phase_type == "post_arrival"
        assert phases[-1].start_datetime.hour == 10  # 10:40 arrival

    def test_pre_departure_ends_before_flight(self):
        """Pre-departure phase must end with buffer before departure."""
        # ... test 3-hour buffer

    def test_post_arrival_starts_at_landing(self):
        """Post-arrival phase must start at actual arrival time."""
        # ... test arrival time awareness


class TestInterventionPlanner:
    """Test intervention planning calls science layer correctly."""

    def test_light_constrained_to_phase(self):
        """Light intervention should be constrained to phase bounds."""
        # Science says light at 05:00, but phase starts at 07:00
        # Result should be light at 07:00 (or removed if window too small)

    def test_arrival_nap_has_hard_cutoff(self):
        """Arrival nap must end by 1pm or 6-8h before sleep."""


class TestConstraintFilter:
    """Test practical constraint application."""

    def test_records_violations(self):
        """Filter should record all constraint violations."""
        # Useful for debugging and user feedback

    def test_no_activities_before_landing(self):
        """Post-arrival phase should have no pre-arrival activities."""
        # This is the bug we're fixing!
```

---

## Migration Path

### Week 1: Foundation
1. Create `science/` module structure
2. Extract PRC logic (light, melatonin)
3. Add CBTmin tracker
4. Write tests for science layer

### Week 2: Phase System
1. Define Phase types
2. Implement PhaseGenerator
3. Implement InterventionPlanner
4. Write integration tests

### Week 3: Integration
1. Refactor main scheduler to use phases
2. Implement ConstraintFilter
3. Update API response types
4. Run realistic flight tests - all should pass

### Week 4: Polish
1. Add science_impact feedback to responses
2. Update frontend to show phase info (optional)
3. Performance testing
4. Documentation

---

## Success Criteria

1. **All 14 realistic flight tests pass** without post-hoc filtering hacks
2. **Science layer is pure** - no flight awareness in PRC/marker code
3. **Constraints are auditable** - can see exactly what was adjusted and why
4. **Backward compatible** - existing API consumers don't break
5. **Extensible** - multi-leg trips and layovers become straightforward

---

## Resolved Decisions

The following questions have been resolved per `design_docs/flight-timing-edge-cases.md`:

### 1. In-Transit Sleep Strategy ✓

**Decision:** Model in-flight sleep strategically based on flight duration.

| Flight Duration | Approach |
|-----------------|----------|
| < 8 hours | Single optional nap |
| 8-12 hours | One structured sleep window |
| **12+ hours (ULR)** | Two sleep windows, timed to circadian position |

**Rationale:** Aviation research shows pilots on ULR flights average only 3.3h of actual sleep during 7h rest opportunities. Strategic timing based on CBTmin position improves both sleep quality and adaptation trajectory.

**Implementation:** Added `IN_TRANSIT_ULR` phase type with `_generate_ulr_transit_phases()` that calculates two optimal sleep windows.

---

### 2. Science Impact Feedback ✓

**Decision:** Do not show `science_impact` by default. Only surface at decision points.

| Context | Show Impact? | Framing |
|---------|--------------|---------|
| Comparing flight options (pre-booking) | Yes | "Flight A allows ~2 days faster adaptation" |
| After booking (schedule generation) | **No** | Just provide the optimized plan |
| User explicitly asks | Yes | "Given your flight timing, full adaptation takes ~X days" |

**Rationale:** Post-booking, quantifying suboptimality for unchangeable decisions creates frustration. Actionable information is more useful than metrics users can't change.

**Implementation:** Changed `ScheduleResponse.science_impact` to `_science_impact_internal` with `get_science_impact(context)` method that only returns value for `"compare_flights"` or `"user_asked"` contexts.

**Exception:** If arrival timing is catastrophically bad (antidromic shift risk), warn user: "Your arrival time may make initial adjustment harder. The plan accounts for this, but the first 1-2 days may feel more challenging."

---

### 3. Multi-Leg Trip Strategy ✓

**Decision:** Strategy depends on layover duration and direction consistency.

| Layover Duration | Strategy | Rationale |
|------------------|----------|-----------|
| < 48 hours | Aim through to final destination | Insufficient time to adapt; partial shift creates compounded misalignment |
| 48-96 hours | Partial adaptation to layover timezone | Some benefit from local alignment, maintain trajectory |
| > 96 hours (4+ days) | Restart (two separate trips) | Sufficient time for meaningful adaptation |
| **Opposite directions** | Always restart | Can't aim through when directions conflict |

**Rationale:** The circadian clock shifts 1-1.5h per day—meaningful adaptation requires 3+ days. For short layovers, aiming through reduces cumulative misalignment.

**Implementation:** Added `_calculate_multi_leg_strategy()` with direction checking and layover duration logic.

---

### 4. Partial Pre-Departure Day ✓

**Decision:** Pro-rate shift targets for partial days, with an 8-hour floor.

| Available Hours | Target Phase Shift |
|-----------------|-------------------|
| 16+ hours | Full daily target (1h advance / 1.5h delay) |
| 8-16 hours | 50-100% of daily target (scaled linearly) |
| **< 8 hours** | Skip formal intervention; provide single recommendation |

**Rationale:** Cramming aggressive interventions into limited time creates stress without proportional benefit. One high-quality intervention beats multiple rushed ones.

**Implementation:** Added `_calculate_phase_shift_target()` with linear scaling and `_plan_single_recommendation()` for very short phases (e.g., "Get bright light at 7am" with explanation "Your departure day is short—focus on this one thing").

---

## References

- Eastman CI, Burgess HJ. (2009). How to travel the world without jet lag. *Sleep Medicine Clinics*, 4(2), 241-255.
- Gander PH et al. (2013). Circadian adaptation of airline pilots during extended duration operations. *Chronobiology International*, 30(8), 963-972.
- Lowden A, Åkerstedt T. (1998). Retaining home-base sleep hours to prevent jet lag. *Aviation, Space, and Environmental Medicine*, 69(12), 1193-1198.
- Roach GD et al. (2012). In-flight sleep of flight crew during a 7-hour rest break. *Journal of Clinical Sleep Medicine*, 8(5), 461-467.
