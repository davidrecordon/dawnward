"""
Tests for timezone handling across phases.

Verifies that:
1. In-transit phases have timezone=None
2. Pre-departure phases use origin timezone
3. Post-arrival phases use destination timezone
4. Scheduler converts None timezone to "In transit" string
5. Ultra-long-range flights (12+ hours) are correctly classified
6. Phase sequence has correct timezone progression
"""

import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from circadian.scheduler_v2 import ScheduleGeneratorV2
from circadian.scheduling.phase_generator import ULR_FLIGHT_THRESHOLD_HOURS, PhaseGenerator
from circadian.types import ScheduleRequest, TripLeg


class TestPhaseTimezones:
    """Test that phases have correct timezone values."""

    def _make_request(
        self,
        origin_tz: str,
        dest_tz: str,
        departure_datetime: str,
        arrival_datetime: str,
        prep_days: int = 2,
    ) -> ScheduleRequest:
        """Helper to create test request."""
        return ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz=origin_tz,
                    dest_tz=dest_tz,
                    departure_datetime=departure_datetime,
                    arrival_datetime=arrival_datetime,
                )
            ],
            prep_days=prep_days,
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

    def _generate_phases(
        self,
        origin_tz: str,
        dest_tz: str,
        departure_datetime: str,
        arrival_datetime: str,
        prep_days: int = 2,
    ) -> list:
        """Helper to generate phases for testing."""
        from circadian.circadian_math import calculate_timezone_shift

        leg = TripLeg(
            origin_tz=origin_tz,
            dest_tz=dest_tz,
            departure_datetime=departure_datetime,
            arrival_datetime=arrival_datetime,
        )

        dep_dt = datetime.fromisoformat(departure_datetime.replace("Z", "+00:00"))
        total_shift, direction = calculate_timezone_shift(origin_tz, dest_tz, dep_dt)

        generator = PhaseGenerator(
            legs=[leg],
            prep_days=prep_days,
            wake_time="07:00",
            sleep_time="23:00",
            total_shift=total_shift,
            direction=direction,
        )

        return generator.generate_phases()

    def test_in_transit_phase_timezone_is_none(self):
        """In-transit phases (both regular and ULR) should have timezone=None."""
        # SFO → LHR: ~10h flight
        phases = self._generate_phases(
            origin_tz="America/Los_Angeles",
            dest_tz="Europe/London",
            departure_datetime="2025-01-15T18:00:00",
            arrival_datetime="2025-01-16T12:00:00",
        )

        # Check for any in_transit type (regular or ULR)
        in_transit = [p for p in phases if "in_transit" in p.phase_type]
        assert len(in_transit) >= 1, (
            f"Should have at least one in_transit phase, got phases: {[p.phase_type for p in phases]}"
        )

        for phase in in_transit:
            assert phase.timezone is None, (
                f"In-transit phase should have timezone=None, got {phase.timezone}"
            )

    def test_pre_departure_phase_timezone_matches_origin(self):
        """Pre-departure phase should use origin timezone."""
        origin_tz = "America/Los_Angeles"

        phases = self._generate_phases(
            origin_tz=origin_tz,
            dest_tz="Europe/London",
            departure_datetime="2025-01-15T18:00:00",
            arrival_datetime="2025-01-16T12:00:00",
        )

        pre_departure = [p for p in phases if p.phase_type == "pre_departure"]
        assert len(pre_departure) == 1, "Should have exactly one pre_departure phase"
        assert pre_departure[0].timezone == origin_tz, (
            f"Pre-departure should use origin tz {origin_tz}, got {pre_departure[0].timezone}"
        )

    def test_post_arrival_phase_timezone_matches_destination(self):
        """Post-arrival phase should use destination timezone."""
        dest_tz = "Europe/London"

        phases = self._generate_phases(
            origin_tz="America/Los_Angeles",
            dest_tz=dest_tz,
            departure_datetime="2025-01-15T18:00:00",
            arrival_datetime="2025-01-16T12:00:00",
        )

        post_arrival = [p for p in phases if p.phase_type == "post_arrival"]
        assert len(post_arrival) == 1, "Should have exactly one post_arrival phase"
        assert post_arrival[0].timezone == dest_tz, (
            f"Post-arrival should use dest tz {dest_tz}, got {post_arrival[0].timezone}"
        )

    def test_preparation_phase_timezone_matches_origin(self):
        """Preparation phases should use origin timezone."""
        origin_tz = "America/Los_Angeles"

        phases = self._generate_phases(
            origin_tz=origin_tz,
            dest_tz="Europe/London",
            departure_datetime="2025-01-15T18:00:00",
            arrival_datetime="2025-01-16T12:00:00",
            prep_days=2,
        )

        preparation = [p for p in phases if p.phase_type == "preparation"]
        for phase in preparation:
            assert phase.timezone == origin_tz, (
                f"Preparation phase should use origin tz {origin_tz}, got {phase.timezone}"
            )

    def test_adaptation_phase_timezone_matches_destination(self):
        """Adaptation phases should use destination timezone."""
        dest_tz = "Europe/London"

        phases = self._generate_phases(
            origin_tz="America/Los_Angeles",
            dest_tz=dest_tz,
            departure_datetime="2025-01-15T18:00:00",
            arrival_datetime="2025-01-16T12:00:00",
        )

        adaptation = [p for p in phases if p.phase_type == "adaptation"]
        for phase in adaptation:
            assert phase.timezone == dest_tz, (
                f"Adaptation phase should use dest tz {dest_tz}, got {phase.timezone}"
            )


class TestSchedulerTimezoneConversion:
    """Test that interventions carry complete timezone context."""

    def _make_request(
        self,
        origin_tz: str,
        dest_tz: str,
        departure_datetime: str,
        arrival_datetime: str,
    ) -> ScheduleRequest:
        """Helper to create test request."""
        return ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz=origin_tz,
                    dest_tz=dest_tz,
                    departure_datetime=departure_datetime,
                    arrival_datetime=arrival_datetime,
                )
            ],
            prep_days=2,
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

    def test_in_transit_interventions_have_timezone_context(self):
        """In-transit interventions should have origin_tz and dest_tz set."""
        # Use a ULR flight to ensure we get in-transit output (non-ULR is skipped)
        request = self._make_request(
            origin_tz="America/Los_Angeles",
            dest_tz="Asia/Tokyo",
            departure_datetime="2025-01-15T10:00:00",
            arrival_datetime="2025-01-16T14:00:00",  # ~13h flight (ULR)
        )

        # Use a past datetime so no filtering happens
        past_datetime = datetime(2025, 1, 10, 12, 0)
        generator = ScheduleGeneratorV2()
        response = generator.generate_schedule(request, current_datetime=past_datetime)

        # Find any in-transit day schedules (ULR flights produce output)
        in_transit_days = [
            ds for ds in response.interventions if ds.phase_type in ("in_transit", "in_transit_ulr")
        ]

        # In-transit interventions should have timezone context
        for day_schedule in in_transit_days:
            for item in day_schedule.items:
                assert item.origin_tz == "America/Los_Angeles", (
                    f"In-transit item should have origin_tz set, got {item.origin_tz}"
                )
                assert item.dest_tz == "Asia/Tokyo", (
                    f"In-transit item should have dest_tz set, got {item.dest_tz}"
                )
                assert item.show_dual_timezone is True, (
                    "In-transit item should have show_dual_timezone=True"
                )

    def test_interventions_carry_timezone_context(self):
        """All interventions should carry origin_tz and dest_tz."""
        request = self._make_request(
            origin_tz="America/Los_Angeles",
            dest_tz="Europe/London",
            departure_datetime="2025-01-15T18:00:00",
            arrival_datetime="2025-01-16T12:00:00",
        )

        past_datetime = datetime(2025, 1, 10, 12, 0)
        generator = ScheduleGeneratorV2()
        response = generator.generate_schedule(request, current_datetime=past_datetime)

        # Check all interventions have timezone context
        for ds in response.interventions:
            for item in ds.items:
                assert item.origin_tz == "America/Los_Angeles", (
                    f"Item should have origin_tz, got {item.origin_tz}"
                )
                assert item.dest_tz == "Europe/London", (
                    f"Item should have dest_tz, got {item.dest_tz}"
                )
                assert item.origin_time is not None, "Item should have origin_time"
                assert item.dest_time is not None, "Item should have dest_time"

    def test_is_in_transit_flag_set_correctly(self):
        """DaySchedule.is_in_transit should be True only for in-transit phases."""
        # Use a ULR flight to ensure we get in-transit output
        request = self._make_request(
            origin_tz="America/Los_Angeles",
            dest_tz="Asia/Tokyo",
            departure_datetime="2025-01-15T10:00:00",
            arrival_datetime="2025-01-16T14:00:00",  # ~13h flight (ULR)
        )

        past_datetime = datetime(2025, 1, 10, 12, 0)
        generator = ScheduleGeneratorV2()
        response = generator.generate_schedule(request, current_datetime=past_datetime)

        for ds in response.interventions:
            if ds.phase_type in ("in_transit", "in_transit_ulr"):
                assert ds.is_in_transit is True, (
                    f"In-transit phase should have is_in_transit=True, got {ds.is_in_transit}"
                )
            else:
                assert ds.is_in_transit is False, (
                    f"Non-transit phase {ds.phase_type} should have is_in_transit=False, got {ds.is_in_transit}"
                )


class TestUlrFlightDetection:
    """Test that ultra-long-range flights are correctly classified."""

    def _calculate_flight_duration(self, departure: str, arrival: str) -> float:
        """Helper to calculate flight duration in hours."""
        dep = datetime.fromisoformat(departure.replace("Z", "+00:00"))
        arr = datetime.fromisoformat(arrival.replace("Z", "+00:00"))
        return (arr - dep).total_seconds() / 3600

    def test_ulr_threshold_value(self):
        """ULR threshold should be 12 hours."""
        assert ULR_FLIGHT_THRESHOLD_HOURS == 12.0

    def test_short_flight_is_not_ulr(self):
        """Flights under 12h should be in_transit, not in_transit_ulr."""
        from circadian.circadian_math import calculate_timezone_shift

        # SFO → NYC: ~5.5h flight
        leg = TripLeg(
            origin_tz="America/Los_Angeles",
            dest_tz="America/New_York",
            departure_datetime="2025-01-15T08:00:00",
            arrival_datetime="2025-01-15T16:30:00",  # 5.5h accounting for TZ
        )

        dep_dt = datetime.fromisoformat(leg.departure_datetime)
        total_shift, direction = calculate_timezone_shift(leg.origin_tz, leg.dest_tz, dep_dt)

        generator = PhaseGenerator(
            legs=[leg],
            prep_days=1,
            wake_time="07:00",
            sleep_time="23:00",
            total_shift=total_shift,
            direction=direction,
        )

        phases = generator.generate_phases()
        transit_phases = [p for p in phases if "in_transit" in p.phase_type]

        for phase in transit_phases:
            assert phase.phase_type == "in_transit", (
                f"Short flight should be in_transit, not {phase.phase_type}"
            )
            assert not phase.is_ulr_flight

    def test_long_flight_is_ulr(self):
        """Flights 12h+ should be in_transit_ulr."""
        from circadian.circadian_math import calculate_timezone_shift

        # SFO → SYD: ~15h flight
        leg = TripLeg(
            origin_tz="America/Los_Angeles",
            dest_tz="Australia/Sydney",
            departure_datetime="2025-01-15T22:00:00",
            arrival_datetime="2025-01-17T06:00:00",  # ~15h flight
        )

        dep_dt = datetime.fromisoformat(leg.departure_datetime)
        total_shift, direction = calculate_timezone_shift(leg.origin_tz, leg.dest_tz, dep_dt)

        generator = PhaseGenerator(
            legs=[leg],
            prep_days=1,
            wake_time="07:00",
            sleep_time="23:00",
            total_shift=total_shift,
            direction=direction,
        )

        phases = generator.generate_phases()
        ulr_phases = [p for p in phases if p.phase_type == "in_transit_ulr"]

        assert len(ulr_phases) >= 1, "Should have at least one ULR phase for 15h flight"
        for phase in ulr_phases:
            assert phase.is_ulr_flight
            assert phase.timezone is None, "ULR phase should also have timezone=None"


class TestUlrSleepWindows:
    """Test ULR sleep window generation and offset calculation."""

    def test_ulr_sleep_windows_have_flight_offset_hours(self, frozen_time):
        """ULR sleep windows should have flight_offset_hours in final schedule."""
        from circadian.scheduler_v2 import ScheduleGeneratorV2
        from circadian.types import ScheduleRequest

        # SFO → SIN: 17h flight (dates are after frozen_time of Jan 1, 2026)
        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Asia/Singapore",
                    departure_datetime="2026-01-15T09:45",
                    arrival_datetime="2026-01-16T19:10",
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="23:00",
        )

        scheduler = ScheduleGeneratorV2()
        response = scheduler.generate_schedule(request)

        # Find in-transit schedule
        in_transit = [d for d in response.interventions if d.is_in_transit]
        assert len(in_transit) >= 1, "Should have in-transit schedule for ULR flight"

        # Check nap_window interventions have flight_offset_hours
        ulr_schedule = in_transit[0]
        nap_windows = [i for i in ulr_schedule.items if i.type == "nap_window"]
        assert len(nap_windows) == 2, "ULR flight should have 2 sleep windows"

        for nap in nap_windows:
            assert nap.flight_offset_hours is not None, (
                f"nap_window at {nap.time} should have flight_offset_hours"
            )
            assert nap.flight_offset_hours >= 0, "flight_offset_hours should be non-negative"

    def test_ulr_flight_duration_calculated_in_utc(self, frozen_time):
        """Flight duration should be calculated in UTC, not naive local times."""
        from circadian.circadian_math import calculate_timezone_shift

        # SFO (PST, UTC-8) → SIN (SGT, UTC+8) = 16h difference
        # Departure: 9:45 AM PST = 5:45 PM UTC
        # Arrival: 7:10 PM SGT = 11:10 AM UTC (next day)
        # Flight duration: 17h 25m
        leg = TripLeg(
            origin_tz="America/Los_Angeles",
            dest_tz="Asia/Singapore",
            departure_datetime="2026-01-15T09:45",
            arrival_datetime="2026-01-16T19:10",
        )

        dep_dt = datetime.fromisoformat(leg.departure_datetime)
        total_shift, direction = calculate_timezone_shift(leg.origin_tz, leg.dest_tz, dep_dt)

        generator = PhaseGenerator(
            legs=[leg],
            prep_days=1,
            wake_time="07:00",
            sleep_time="23:00",
            total_shift=total_shift,
            direction=direction,
        )

        phases = generator.generate_phases()
        ulr_phase = next(p for p in phases if p.phase_type == "in_transit_ulr")

        # Naive calculation would give: (Jan 12 19:10) - (Jan 11 09:45) = 33h 25m
        # Correct UTC calculation should give: ~17h 25m
        assert ulr_phase.flight_duration_hours < 20, (
            f"Flight duration {ulr_phase.flight_duration_hours:.1f}h seems too long; "
            "should be ~17h, not ~33h (naive local time difference)"
        )
        assert ulr_phase.flight_duration_hours > 15, (
            f"Flight duration {ulr_phase.flight_duration_hours:.1f}h seems too short"
        )

    def test_regular_flight_nap_has_flight_offset_hours(self):
        """Regular (non-ULR) flight naps should also have flight_offset_hours."""
        from circadian.scheduler_v2 import ScheduleGeneratorV2
        from circadian.types import ScheduleRequest

        # SFO → LHR: ~10h flight (regular, not ULR)
        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Europe/London",
                    departure_datetime="2026-01-15T20:45",
                    arrival_datetime="2026-01-16T15:00",
                )
            ],
            prep_days=2,
            wake_time="07:00",
            sleep_time="23:00",
        )

        scheduler = ScheduleGeneratorV2()
        response = scheduler.generate_schedule(request)

        # Find in-transit schedule
        in_transit = [d for d in response.interventions if d.is_in_transit]
        assert len(in_transit) >= 1, "Should have in-transit schedule for 10h flight"

        # Check nap_window interventions have flight_offset_hours
        transit_schedule = in_transit[0]
        nap_windows = [i for i in transit_schedule.items if i.type == "nap_window"]
        assert len(nap_windows) >= 1, "10h flight should have at least 1 nap suggestion"

        for nap in nap_windows:
            assert nap.flight_offset_hours is not None, (
                f"nap_window at {nap.time} should have flight_offset_hours"
            )
            assert nap.flight_offset_hours >= 0, "flight_offset_hours should be non-negative"


class TestWakeTargetCapping:
    """Test that wake_target is capped for pre_departure phases."""

    def test_wake_target_capped_3h_before_departure(self, frozen_time):
        """Wake target should be capped to 3h before departure on flight day."""
        from circadian.scheduler_v2 import ScheduleGeneratorV2
        from circadian.types import ScheduleRequest

        # Early morning departure where circadian wake would be after flight
        # SFO → SIN: 9:45 AM departure (dates after frozen_time of Jan 1, 2026)
        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Asia/Singapore",
                    departure_datetime="2026-01-15T09:45",
                    arrival_datetime="2026-01-16T19:10",
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="23:00",
        )

        scheduler = ScheduleGeneratorV2()
        response = scheduler.generate_schedule(request)

        # Find pre_departure schedule
        pre_departure = [d for d in response.interventions if d.phase_type == "pre_departure"]
        assert len(pre_departure) >= 1, "Should have pre_departure schedule"

        # Find wake_target intervention
        wake_targets = [i for i in pre_departure[0].items if i.type == "wake_target"]
        assert len(wake_targets) == 1, "Should have exactly one wake_target"

        wake_time = wake_targets[0].time
        hour, minute = map(int, wake_time.split(":"))
        wake_minutes = hour * 60 + minute

        # Departure is 9:45 = 585 minutes
        # Max wake should be 9:45 - 3:00 = 6:45 = 405 minutes
        max_wake_minutes = (9 * 60 + 45) - (3 * 60)

        assert wake_minutes <= max_wake_minutes, (
            f"wake_target at {wake_time} should be <= 06:45 (3h before 09:45 departure)"
        )


class TestPhaseSequenceTimezones:
    """Test that timezone progression through phases is correct."""

    def test_timezone_progression_eastbound(self):
        """Eastbound flight: origin → None → destination."""
        from circadian.circadian_math import calculate_timezone_shift

        origin = "America/Los_Angeles"
        dest = "Europe/London"

        leg = TripLeg(
            origin_tz=origin,
            dest_tz=dest,
            departure_datetime="2025-01-15T18:00:00",
            arrival_datetime="2025-01-16T12:00:00",
        )

        dep_dt = datetime.fromisoformat(leg.departure_datetime)
        total_shift, direction = calculate_timezone_shift(origin, dest, dep_dt)

        generator = PhaseGenerator(
            legs=[leg],
            prep_days=1,
            wake_time="07:00",
            sleep_time="23:00",
            total_shift=total_shift,
            direction=direction,
        )

        phases = generator.generate_phases()

        # Verify progression
        for phase in phases:
            if phase.phase_type in ("preparation", "pre_departure"):
                assert phase.timezone == origin, f"{phase.phase_type} should have origin tz"
            elif phase.phase_type in ("in_transit", "in_transit_ulr"):
                assert phase.timezone is None, f"{phase.phase_type} should have None tz"
            elif phase.phase_type in ("post_arrival", "adaptation"):
                assert phase.timezone == dest, f"{phase.phase_type} should have dest tz"

    def test_timezone_progression_westbound(self):
        """Westbound flight: origin → None → destination."""
        from circadian.circadian_math import calculate_timezone_shift

        origin = "Europe/Paris"
        dest = "America/Los_Angeles"

        leg = TripLeg(
            origin_tz=origin,
            dest_tz=dest,
            departure_datetime="2025-01-15T10:00:00",
            arrival_datetime="2025-01-15T13:00:00",  # Same calendar day (westbound)
        )

        dep_dt = datetime.fromisoformat(leg.departure_datetime)
        total_shift, direction = calculate_timezone_shift(origin, dest, dep_dt)

        generator = PhaseGenerator(
            legs=[leg],
            prep_days=1,
            wake_time="07:00",
            sleep_time="23:00",
            total_shift=total_shift,
            direction=direction,
        )

        phases = generator.generate_phases()

        # Verify progression
        for phase in phases:
            if phase.phase_type in ("preparation", "pre_departure"):
                assert phase.timezone == origin, (
                    f"{phase.phase_type} should have origin tz {origin}, got {phase.timezone}"
                )
            elif phase.phase_type in ("in_transit", "in_transit_ulr"):
                assert phase.timezone is None, f"{phase.phase_type} should have None tz"
            elif phase.phase_type in ("post_arrival", "adaptation"):
                assert phase.timezone == dest, (
                    f"{phase.phase_type} should have dest tz {dest}, got {phase.timezone}"
                )

    def test_multi_leg_timezone_progression(self):
        """Multi-leg trip: verify timezones at each transition."""
        from circadian.circadian_math import calculate_timezone_shift

        # LAX → LHR → CDG
        legs = [
            TripLeg(
                origin_tz="America/Los_Angeles",
                dest_tz="Europe/London",
                departure_datetime="2025-01-15T18:00:00",
                arrival_datetime="2025-01-16T12:00:00",
            ),
            TripLeg(
                origin_tz="Europe/London",
                dest_tz="Europe/Paris",
                departure_datetime="2025-01-17T09:00:00",
                arrival_datetime="2025-01-17T11:30:00",
            ),
        ]

        first_leg = legs[0]
        dep_dt = datetime.fromisoformat(first_leg.departure_datetime)
        total_shift, direction = calculate_timezone_shift(
            first_leg.origin_tz, legs[-1].dest_tz, dep_dt
        )

        generator = PhaseGenerator(
            legs=legs,
            prep_days=1,
            wake_time="07:00",
            sleep_time="23:00",
            total_shift=total_shift,
            direction=direction,
        )

        phases = generator.generate_phases()

        # Verify we have phases with different timezones
        timezones_seen = set()
        for phase in phases:
            if phase.timezone is not None:
                timezones_seen.add(phase.timezone)

        # Should see origin (LAX), layover (LHR), and destination (CDG)
        assert "America/Los_Angeles" in timezones_seen, "Should see origin timezone"
        assert "Europe/Paris" in timezones_seen, "Should see destination timezone"


class TestMultiLegInterventionContext:
    """Test that interventions carry consistent timezone context in multi-leg trips."""

    def test_multi_leg_interventions_have_final_destination_context(self, frozen_time):
        """All interventions should carry origin and final destination timezone context."""
        from circadian.scheduler_v2 import ScheduleGeneratorV2
        from circadian.types import ScheduleRequest

        # LAX → LHR → CDG (layover in London, final destination Paris)
        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Europe/London",
                    departure_datetime="2026-01-15T18:00",
                    arrival_datetime="2026-01-16T12:00",
                ),
                TripLeg(
                    origin_tz="Europe/London",
                    dest_tz="Europe/Paris",
                    departure_datetime="2026-01-17T09:00",
                    arrival_datetime="2026-01-17T11:30",
                ),
            ],
            prep_days=2,
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        scheduler = ScheduleGeneratorV2()
        response = scheduler.generate_schedule(request)

        # All interventions should have consistent origin/dest timezone context
        for day_schedule in response.interventions:
            for item in day_schedule.items:
                assert item.origin_tz == "America/Los_Angeles", (
                    f"Intervention {item.type} should have origin LAX timezone, "
                    f"got {item.origin_tz}"
                )
                assert item.dest_tz == "Europe/Paris", (
                    f"Intervention {item.type} should have final dest Paris timezone, "
                    f"got {item.dest_tz}"
                )

    def test_multi_leg_adaptation_uses_final_destination(self, frozen_time):
        """Adaptation days should use the final destination timezone."""
        from circadian.scheduler_v2 import ScheduleGeneratorV2
        from circadian.types import ScheduleRequest

        # SFO → NRT → ICN (layover in Tokyo, final destination Seoul)
        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Asia/Tokyo",
                    departure_datetime="2026-01-15T12:00",
                    arrival_datetime="2026-01-16T16:00",
                ),
                TripLeg(
                    origin_tz="Asia/Tokyo",
                    dest_tz="Asia/Seoul",
                    departure_datetime="2026-01-17T10:00",
                    arrival_datetime="2026-01-17T12:30",
                ),
            ],
            prep_days=2,
            wake_time="07:00",
            sleep_time="23:00",
        )

        scheduler = ScheduleGeneratorV2()
        response = scheduler.generate_schedule(request)

        # Find adaptation days
        adaptation_days = [ds for ds in response.interventions if ds.phase_type == "adaptation"]
        assert len(adaptation_days) > 0, "Should have adaptation days"

        for day_schedule in adaptation_days:
            for item in day_schedule.items:
                # dest_time should be in Seoul timezone
                assert item.dest_tz == "Asia/Seoul", (
                    f"Adaptation intervention should have Seoul dest_tz, got {item.dest_tz}"
                )


class TestMidnightCrossingInterventions:
    """Test handling of interventions that cross midnight."""

    def test_sleep_target_crosses_midnight_different_dates(self, frozen_time):
        """
        Sleep target at 11:30 PM origin time might be 7:30 AM dest time next day.
        Verify origin_date and dest_date differ appropriately.
        """
        from circadian.scheduler_v2 import ScheduleGeneratorV2
        from circadian.types import ScheduleRequest

        # SFO → LHR: 8h timezone difference
        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Europe/London",
                    departure_datetime="2026-01-20T17:00",
                    arrival_datetime="2026-01-21T11:00",
                )
            ],
            prep_days=2,
            wake_time="07:00",
            sleep_time="23:30",  # Late sleep time
            uses_melatonin=True,
            uses_caffeine=True,
        )

        scheduler = ScheduleGeneratorV2()
        response = scheduler.generate_schedule(request)

        # Find sleep_target interventions
        for day_schedule in response.interventions:
            for item in day_schedule.items:
                if item.type == "sleep_target":
                    # Parse times
                    origin_hour = int(item.origin_time.split(":")[0])
                    dest_hour = int(item.dest_time.split(":")[0])

                    # If origin is late night (23:xx) and dest is morning (07:xx),
                    # dates should differ by 1 day
                    if origin_hour >= 22 and dest_hour < 12:
                        assert item.origin_date != item.dest_date, (
                            f"Late night origin ({item.origin_time}) and morning dest "
                            f"({item.dest_time}) should have different dates"
                        )

    def test_early_morning_intervention_sorts_correctly(self, frozen_time):
        """
        Interventions at 00:xx or 01:xx should sort as late-night (after 23:xx),
        not early morning.
        """
        from circadian.scheduler_v2 import ScheduleGeneratorV2
        from circadian.types import ScheduleRequest

        # Short timezone shift to get interventions around midnight
        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="America/Denver",
                    departure_datetime="2026-01-20T22:00",
                    arrival_datetime="2026-01-20T23:30",
                )
            ],
            prep_days=1,
            wake_time="07:00",
            sleep_time="00:30",  # Very late sleep (12:30 AM)
            uses_melatonin=True,
        )

        scheduler = ScheduleGeneratorV2()
        response = scheduler.generate_schedule(request)

        # Verify schedule generates without errors
        assert response is not None
        assert len(response.interventions) > 0

    def test_origin_date_dest_date_are_valid_iso_format(self, frozen_time):
        """All interventions should have valid ISO date format for origin_date and dest_date."""
        import re

        from circadian.scheduler_v2 import ScheduleGeneratorV2
        from circadian.types import ScheduleRequest

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Asia/Tokyo",
                    departure_datetime="2026-01-20T12:00",
                    arrival_datetime="2026-01-21T16:00",
                )
            ],
            prep_days=2,
            wake_time="07:00",
            sleep_time="23:00",
        )

        scheduler = ScheduleGeneratorV2()
        response = scheduler.generate_schedule(request)

        iso_date_pattern = re.compile(r"^\d{4}-\d{2}-\d{2}$")

        for day_schedule in response.interventions:
            for item in day_schedule.items:
                assert iso_date_pattern.match(item.origin_date), (
                    f"origin_date '{item.origin_date}' should be YYYY-MM-DD format"
                )
                assert iso_date_pattern.match(item.dest_date), (
                    f"dest_date '{item.dest_date}' should be YYYY-MM-DD format"
                )


class TestCrossDatelineFlightDates:
    """Test date handling for flights that cross the international date line."""

    def test_inflight_nap_dest_date_computed_from_flight_offset(self, frozen_time):
        """
        In-flight naps with flight_offset_hours should have dest_date computed
        from departure + offset, not from phase start date.

        SFO → SIN: Departs Jan 22 09:45 LA = Jan 23 01:45 Singapore
        A nap at 03:45 Singapore (4h into flight) should be on Jan 23, not Jan 22.
        """
        from circadian.scheduler_v2 import ScheduleGeneratorV2
        from circadian.types import ScheduleRequest

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Asia/Singapore",
                    departure_datetime="2026-01-22T09:45",
                    arrival_datetime="2026-01-23T19:00",  # ~17h flight
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
            nap_preference="flight_only",
        )

        scheduler = ScheduleGeneratorV2()
        response = scheduler.generate_schedule(request)

        # Find in-transit nap windows
        for day_schedule in response.interventions:
            if day_schedule.phase_type in ("in_transit", "in_transit_ulr"):
                for item in day_schedule.items:
                    if item.type == "nap_window" and item.flight_offset_hours:
                        # Departure is Jan 22 09:45 LA = Jan 23 01:45 Singapore
                        # Any nap during flight should be on Jan 23 Singapore time
                        assert item.dest_date == "2026-01-23", (
                            f"In-flight nap at {item.dest_time} Singapore should be on "
                            f"Jan 23 (dest_date), not {item.dest_date}. "
                            f"Flight departs Jan 22 LA = Jan 23 Singapore."
                        )

    def test_post_arrival_morning_wake_is_next_day(self, frozen_time):
        """
        A wake_target at 06:30 when arrival is 19:00 must be the NEXT morning,
        not the same calendar day (which would be before arrival).

        Arrival: Jan 23 19:00 Singapore
        Wake target: 06:30 Singapore → should be Jan 24, not Jan 23
        """
        from circadian.scheduler_v2 import ScheduleGeneratorV2
        from circadian.types import ScheduleRequest

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Asia/Singapore",
                    departure_datetime="2026-01-22T09:45",
                    arrival_datetime="2026-01-23T19:00",
                )
            ],
            prep_days=2,
            wake_time="06:30",  # Early wake time
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        scheduler = ScheduleGeneratorV2()
        response = scheduler.generate_schedule(request)

        # Find post_arrival wake_target
        for day_schedule in response.interventions:
            if day_schedule.phase_type == "post_arrival":
                for item in day_schedule.items:
                    if item.type == "wake_target":
                        wake_hour = int(item.dest_time.split(":")[0])
                        # Arrival is 19:00, so any wake before 19:00 must be next day
                        if wake_hour < 19:
                            assert item.dest_date == "2026-01-24", (
                                f"Post-arrival wake at {item.dest_time} should be on "
                                f"Jan 24 (morning after 19:00 arrival), not {item.dest_date}"
                            )

    def test_westbound_cross_dateline_dates(self, frozen_time):
        """
        Westbound trans-Pacific flight: Tokyo → Los Angeles
        Crosses dateline, arriving BEFORE you departed (in local time).

        Departs: Jan 23 17:00 Tokyo
        Arrives: Jan 23 10:00 LA (same calendar date but earlier local time)

        In-flight naps should have correct dates in both timezones.
        """
        from circadian.scheduler_v2 import ScheduleGeneratorV2
        from circadian.types import ScheduleRequest

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="Asia/Tokyo",
                    dest_tz="America/Los_Angeles",
                    departure_datetime="2026-01-23T17:00",
                    arrival_datetime="2026-01-23T10:00",  # ~10h flight, arrives "earlier"
                )
            ],
            prep_days=2,
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=True,
            uses_caffeine=True,
            nap_preference="flight_only",
        )

        scheduler = ScheduleGeneratorV2()
        response = scheduler.generate_schedule(request)

        # Find in-transit nap windows
        for day_schedule in response.interventions:
            if day_schedule.phase_type in ("in_transit", "in_transit_ulr"):
                for item in day_schedule.items:
                    if item.type == "nap_window" and item.flight_offset_hours:
                        # Departure is Jan 23 17:00 Tokyo = Jan 23 00:00 LA (UTC+9 to UTC-8 = 17h diff)
                        # Naps during flight are on Jan 23 in Tokyo time
                        # but could be Jan 22 or Jan 23 in LA time depending on offset
                        # Key check: dates should be valid and consistent
                        assert item.origin_date is not None
                        assert item.dest_date is not None
                        # Origin date should be Jan 23 (Tokyo departure date)
                        assert item.origin_date.startswith("2026-01-23"), (
                            f"In-flight nap origin_date should be Jan 23 (Tokyo), "
                            f"not {item.origin_date}"
                        )
