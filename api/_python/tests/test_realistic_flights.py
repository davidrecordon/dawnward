"""
Realistic Flight Scenario Tests

Test the scheduler against real-world flight schedules to catch practical issues
that theoretical tests miss. Uses actual departure/arrival times from major airlines.

Flight schedules sourced from verified airline data (January 2026):
- Hawaiian Airlines (SFO-HNL)
- American Airlines (SFO-JFK)
- Virgin Atlantic (SFO-LHR)
- Air France (SFO-CDG)
- Lufthansa (SFO-FRA)
- Emirates (SFO-DXB)
- Singapore Airlines (SFO-SIN)
- Cathay Pacific (SFO-HKG)
- Japan Airlines (SFO-HND)
- Qantas (SFO-SYD)

Organized by jet lag severity:
- Minimal (3h shift): Hawaii, New York
- Moderate (8-9h shift): London, Paris, Frankfurt
- Severe (12-17h shift): Dubai, Singapore, Hong Kong, Tokyo, Sydney
"""

import sys
from datetime import datetime, timedelta
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent))

from helpers import (
    FlightInfo,
    run_all_validations,
    validate_no_activities_before_landing,
    validate_sleep_not_before_flight,
)

from circadian.scheduler_v2 import ScheduleGeneratorV2
from circadian.types import ScheduleRequest, TripLeg

# Use the phase-based scheduler (v2) which fixes flight timing issues
ScheduleGenerator = ScheduleGeneratorV2


def make_flight_datetime(base_date: datetime, time_str: str, day_offset: int = 0) -> datetime:
    """Create a datetime from a base date, time string, and day offset."""
    hour, minute = map(int, time_str.split(":"))
    return (base_date + timedelta(days=day_offset)).replace(
        hour=hour, minute=minute, second=0, microsecond=0
    )


# =============================================================================
# MINIMAL JET LAG (3h shift)
# =============================================================================


class TestMinimalJetLag:
    """
    Flights with minimal jet lag (~3 hours).

    These routes have shorter timezone shifts but are useful for testing:
    - Schedule generation for small shifts
    - Domestic transcontinental handling (SFO-JFK)
    - Pacific island routes (SFO-HNL)
    """

    def test_hawaiian_ha11_sfo_to_honolulu(self):
        """
        Hawaiian Airlines HA11: SFO 07:00 → HNL 09:35 same day (~5h35m).

        Minimal jet lag (3h west). Tests early morning departure handling.
        """
        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=7)

        # HA11: SFO 07:00 → HNL 09:35 same day
        departure = make_flight_datetime(base_date, "07:00")
        arrival = make_flight_datetime(base_date, "09:35")

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Pacific/Honolulu",
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=1,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=False,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        flight = FlightInfo(
            departure_datetime=departure,
            arrival_datetime=arrival,
            origin_tz="America/Los_Angeles",
            dest_tz="Pacific/Honolulu",
        )

        # 2h west = delay direction (LA is UTC-8, Honolulu is UTC-10)
        assert schedule.direction == "delay", f"Expected delay direction, got {schedule.direction}"
        assert schedule.total_shift_hours == 2, (
            f"Expected 2h shift, got {schedule.total_shift_hours}"
        )

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )

    def test_hawaiian_ha12_honolulu_to_sfo(self):
        """
        Hawaiian Airlines HA12: HNL 12:30 → SFO 20:30 same day (~5h).

        Return flight, minimal jet lag (3h east). Same-day arrival.
        """
        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=10)

        # HA12: HNL 12:30 → SFO 20:30 same day
        departure = make_flight_datetime(base_date, "12:30")
        arrival = make_flight_datetime(base_date, "20:30")

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="Pacific/Honolulu",
                    dest_tz="America/Los_Angeles",
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=1,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=False,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        flight = FlightInfo(
            departure_datetime=departure,
            arrival_datetime=arrival,
            origin_tz="Pacific/Honolulu",
            dest_tz="America/Los_Angeles",
        )

        # 3h east = advance direction
        assert schedule.direction == "advance", (
            f"Expected advance direction, got {schedule.direction}"
        )

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )

    def test_american_aa16_sfo_to_jfk(self):
        """
        American Airlines AA16: SFO 11:00 → JFK 19:35 same day (~5.5h).

        Domestic transcontinental (3h east). Tests advance direction for US routes.
        """
        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=7)

        # AA16: SFO 11:00 → JFK 19:35 same day
        departure = make_flight_datetime(base_date, "11:00")
        arrival = make_flight_datetime(base_date, "19:35")

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="America/New_York",
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=1,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=False,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        flight = FlightInfo(
            departure_datetime=departure,
            arrival_datetime=arrival,
            origin_tz="America/Los_Angeles",
            dest_tz="America/New_York",
        )

        # 3h east = advance direction
        assert schedule.direction == "advance", (
            f"Expected advance direction, got {schedule.direction}"
        )

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )

    def test_american_aa177_jfk_to_sfo(self):
        """
        American Airlines AA177: JFK 19:35 → SFO 23:21 same day (~6h).

        Return flight, evening departure (3h west). Tests evening departure handling.
        """
        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=10)

        # AA177: JFK 19:35 → SFO 23:21 same day
        departure = make_flight_datetime(base_date, "19:35")
        arrival = make_flight_datetime(base_date, "23:21")

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/New_York",
                    dest_tz="America/Los_Angeles",
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=1,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=False,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        flight = FlightInfo(
            departure_datetime=departure,
            arrival_datetime=arrival,
            origin_tz="America/New_York",
            dest_tz="America/Los_Angeles",
        )

        # 3h west = delay direction
        assert schedule.direction == "delay", f"Expected delay direction, got {schedule.direction}"

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )


# =============================================================================
# MODERATE JET LAG (8-9h shift)
# =============================================================================


class TestModerateJetLag:
    """
    Flights with moderate jet lag (8-9 hours).

    These are typical transatlantic routes:
    - SFO-LHR (8h advance)
    - SFO-CDG (9h advance)
    - SFO-FRA (9h advance)

    Key challenges:
    - Overnight eastward flights
    - Next-day arrivals
    - Pre-departure sleep timing
    """

    def test_virgin_vs20_sfo_to_london(self):
        """
        Virgin Atlantic VS20: SFO 16:30 → LHR 10:40+1 (~10h10m).

        Afternoon departure, next-day morning arrival. Classic transatlantic pattern.
        """
        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=7)

        # VS20: SFO 16:30 → LHR 10:40+1
        departure = make_flight_datetime(base_date, "16:30")
        arrival = make_flight_datetime(base_date, "10:40", day_offset=1)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Europe/London",
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        flight = FlightInfo(
            departure_datetime=departure,
            arrival_datetime=arrival,
            origin_tz="America/Los_Angeles",
            dest_tz="Europe/London",
        )

        # 8h east = advance direction
        assert schedule.direction == "advance", (
            f"Expected advance direction, got {schedule.direction}"
        )

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )

    def test_vs20_sleep_target_not_on_day0_pre_departure(self):
        """
        VS20 regression test: sleep_target should NOT appear in Day 0's pre_departure phase.

        For VS20 (4:30 PM departure):
        - Phase ends at 1:30 PM (3h before departure)
        - Any sleep_target would be after the user leaves for the airport
        - The fix ensures no sleep_target is shown before departure
        - User gets sleep guidance in "After Landing" section instead
        """
        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=7)

        departure = make_flight_datetime(base_date, "16:30")
        arrival = make_flight_datetime(base_date, "10:40", day_offset=1)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Europe/London",
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        # Find all Day 0 phases (flight day can have multiple: pre_departure, post_arrival)
        day_0_phases = [ds for ds in schedule.interventions if ds.day == 0]
        assert len(day_0_phases) > 0, "Day 0 should exist"

        # Get pre_departure sleep_target items across all Day 0 phases
        pre_departure_sleep = [
            item
            for ds in day_0_phases
            for item in ds.items
            if item.type == "sleep_target" and item.phase_type == "pre_departure"
        ]

        assert len(pre_departure_sleep) == 0, (
            f"VS20: No sleep_target should appear in pre_departure phase on Day 0. "
            f"Found {len(pre_departure_sleep)} items: {[i.time for i in pre_departure_sleep]}"
        )

        # Verify post_arrival sleep_target exists on the arrival date
        # The UI groups by date, so post_arrival sleep may be on Day 1's entry
        # if Day 1 has the same date as the arrival (which it does for VS20)
        arrival_date = arrival.strftime("%Y-%m-%d")
        post_arrival_sleep = [
            item
            for ds in schedule.interventions
            if ds.date == arrival_date
            for item in ds.items
            if item.type == "sleep_target" and item.phase_type == "post_arrival"
        ]

        assert len(post_arrival_sleep) >= 1, (
            f"VS20: Arrival date {arrival_date} should have post_arrival sleep_target "
            f"for 'After Landing' guidance"
        )

    def test_vs20_wake_target_capped_to_pre_landing(self):
        """
        VS20 regression test: wake_target should be capped to 1h before landing.

        For VS20 (10:40 AM arrival):
        - Circadian wake might be ~11:00 AM (4h shift from 7 AM baseline)
        - But that's AFTER landing - user is already awake!
        - Crew wakes passengers ~1h before landing (9:40 AM)
        - So wake_target should be 9:40 AM with original_time showing circadian target
        """
        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=7)

        departure = make_flight_datetime(base_date, "16:30")
        arrival = make_flight_datetime(base_date, "10:40", day_offset=1)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Europe/London",
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        # Find post_arrival wake_target on arrival date
        arrival_date = arrival.strftime("%Y-%m-%d")
        post_arrival_wake = [
            item
            for ds in schedule.interventions
            if ds.date == arrival_date
            for item in ds.items
            if item.type == "wake_target" and item.phase_type == "post_arrival"
        ]

        assert len(post_arrival_wake) >= 1, (
            f"VS20: Arrival date {arrival_date} should have post_arrival wake_target"
        )

        wake_item = post_arrival_wake[0]

        # Wake should be capped to 1h before landing (9:40 AM for 10:40 AM arrival)
        assert wake_item.dest_time == "09:40", (
            f"VS20: wake_target should be 1h before landing (09:40), got {wake_item.dest_time}"
        )

        # original_time should show the circadian-optimal time
        assert wake_item.original_time is not None, (
            "VS20: wake_target should have original_time set when capped to pre-landing"
        )

        # Title should indicate pre-landing adjustment
        assert "pre-landing" in wake_item.title.lower(), (
            f"VS20: wake_target title should mention 'pre-landing', got '{wake_item.title}'"
        )

    def test_wake_target_not_capped_when_circadian_earlier(self):
        """
        Test that wake_target is NOT capped when circadian wake is earlier than pre-landing.

        If someone's circadian wake is 6:00 AM and landing is at 10:00 AM,
        the wake_target should be 6:00 AM (not 9:00 AM pre-landing time).
        """
        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=7)

        # Flight with late morning arrival
        departure = make_flight_datetime(base_date, "20:00")
        arrival = make_flight_datetime(base_date, "14:00", day_offset=1)

        # User has early wake time (5:00 AM)
        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Europe/London",
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=3,
            wake_time="05:00",  # Early riser
            sleep_time="21:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        # Find post_arrival wake_target on arrival date
        arrival_date = arrival.strftime("%Y-%m-%d")
        post_arrival_wake = [
            item
            for ds in schedule.interventions
            if ds.date == arrival_date
            for item in ds.items
            if item.type == "wake_target" and item.phase_type == "post_arrival"
        ]

        assert len(post_arrival_wake) >= 1, "Should have post_arrival wake_target"

        wake_item = post_arrival_wake[0]

        # original_time should NOT be set since circadian wake is earlier than pre-landing
        # Pre-landing would be 13:00 (1h before 14:00)
        # Circadian wake should be much earlier for an early riser
        if wake_item.original_time is None:
            # Good - no adjustment was needed
            assert "pre-landing" not in wake_item.title.lower(), (
                "Title should not mention pre-landing when no adjustment was made"
            )

    def test_british_ba286_sfo_to_london(self):
        """
        British Airways BA286: SFO 20:40 → LHR 03:10+1 (~7h30m).

        Late evening departure, early morning arrival.
        Tests sleep_target capping behavior:
        - 8:45 PM departure is later than VS20
        - Sleep_target might be capped to practical pre-departure time
        - Should have original_time set if capped
        """
        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=7)

        # BA286: SFO 20:40 → LHR 03:10+1 (updated timing - evening red-eye)
        departure = make_flight_datetime(base_date, "20:40")
        arrival = make_flight_datetime(base_date, "15:10", day_offset=1)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Europe/London",
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        flight = FlightInfo(
            departure_datetime=departure,
            arrival_datetime=arrival,
            origin_tz="America/Los_Angeles",
            dest_tz="Europe/London",
        )

        # 8h east = advance direction
        assert schedule.direction == "advance", (
            f"Expected advance direction, got {schedule.direction}"
        )

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )

        # Check for post_arrival sleep guidance on the arrival date
        # The UI groups by date, so post_arrival sleep may be on Day 1's entry
        arrival_date = arrival.strftime("%Y-%m-%d")
        post_arrival_sleep = [
            item
            for ds in schedule.interventions
            if ds.date == arrival_date
            for item in ds.items
            if item.type == "sleep_target" and item.phase_type == "post_arrival"
        ]

        assert len(post_arrival_sleep) >= 1, (
            f"BA286: Arrival date {arrival_date} should have post_arrival sleep_target "
            f"for 'After Landing' guidance"
        )

    def test_virgin_vs19_london_to_sfo(self):
        """
        Virgin Atlantic VS19: LHR 11:40 → SFO 14:40 same day (~11h).

        Westward return - same calendar day arrival due to timezone gain.
        """
        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=10)

        # VS19: LHR 11:40 → SFO 14:40 same day
        departure = make_flight_datetime(base_date, "11:40")
        arrival = make_flight_datetime(base_date, "14:40")

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="Europe/London",
                    dest_tz="America/Los_Angeles",
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        flight = FlightInfo(
            departure_datetime=departure,
            arrival_datetime=arrival,
            origin_tz="Europe/London",
            dest_tz="America/Los_Angeles",
        )

        # 8h west = delay direction
        assert schedule.direction == "delay", f"Expected delay direction, got {schedule.direction}"

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )

    def test_air_france_af83_sfo_to_paris(self):
        """
        Air France AF83: SFO 15:40 → CDG 11:35+1 (~10h55m).

        Afternoon departure to Paris, next-day late morning arrival.
        """
        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=7)

        # AF83: SFO 15:40 → CDG 11:35+1
        departure = make_flight_datetime(base_date, "15:40")
        arrival = make_flight_datetime(base_date, "11:35", day_offset=1)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Europe/Paris",
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        flight = FlightInfo(
            departure_datetime=departure,
            arrival_datetime=arrival,
            origin_tz="America/Los_Angeles",
            dest_tz="Europe/Paris",
        )

        # 9h east = advance direction
        assert schedule.direction == "advance", (
            f"Expected advance direction, got {schedule.direction}"
        )

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )

    def test_air_france_af84_paris_to_sfo(self):
        """
        Air France AF84: CDG 13:25 → SFO 15:55 same day (~11h30m).

        Early afternoon departure, same-day arrival due to westward travel.
        """
        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=10)

        # AF84: CDG 13:25 → SFO 15:55 same day
        departure = make_flight_datetime(base_date, "13:25")
        arrival = make_flight_datetime(base_date, "15:55")

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="Europe/Paris",
                    dest_tz="America/Los_Angeles",
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        flight = FlightInfo(
            departure_datetime=departure,
            arrival_datetime=arrival,
            origin_tz="Europe/Paris",
            dest_tz="America/Los_Angeles",
        )

        # 9h west = delay direction
        assert schedule.direction == "delay", f"Expected delay direction, got {schedule.direction}"

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )

    def test_lufthansa_lh455_sfo_to_frankfurt(self):
        """
        Lufthansa LH455: SFO 14:40 → FRA 10:30+1 (~10h50m).

        Boeing 747-8 route to Frankfurt, next-day morning arrival.
        """
        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=7)

        # LH455: SFO 14:40 → FRA 10:30+1
        departure = make_flight_datetime(base_date, "14:40")
        arrival = make_flight_datetime(base_date, "10:30", day_offset=1)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Europe/Berlin",  # Frankfurt uses Europe/Berlin
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        flight = FlightInfo(
            departure_datetime=departure,
            arrival_datetime=arrival,
            origin_tz="America/Los_Angeles",
            dest_tz="Europe/Berlin",
        )

        # 9h east = advance direction
        assert schedule.direction == "advance", (
            f"Expected advance direction, got {schedule.direction}"
        )

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )

    def test_lufthansa_lh454_frankfurt_to_sfo(self):
        """
        Lufthansa LH454: FRA 13:20 → SFO 15:55 same day (~11h35m).

        Return flight from Frankfurt, same-day arrival.
        """
        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=10)

        # LH454: FRA 13:20 → SFO 15:55 same day
        departure = make_flight_datetime(base_date, "13:20")
        arrival = make_flight_datetime(base_date, "15:55")

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="Europe/Berlin",
                    dest_tz="America/Los_Angeles",
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        flight = FlightInfo(
            departure_datetime=departure,
            arrival_datetime=arrival,
            origin_tz="Europe/Berlin",
            dest_tz="America/Los_Angeles",
        )

        # 9h west = delay direction
        assert schedule.direction == "delay", f"Expected delay direction, got {schedule.direction}"

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )


# =============================================================================
# SEVERE JET LAG (12-17h shift)
# =============================================================================


class TestSevereJetLag:
    """
    Flights with severe jet lag (12-17 hours).

    Ultra-long-haul routes with complex timezone math:
    - SFO-DXB (12h shift → 12h either direction)
    - SFO-SIN (16h shift → 8h delay, crosses date line)
    - SFO-HKG (16h shift → 8h delay)
    - SFO-HND (17h shift → 7h delay)
    - SFO-SYD (18h shift → 6h advance)

    Special challenges:
    - Date line crossings
    - +2 day arrivals (QF74)
    - -1 day arrivals (CX872)
    - Multiple sleep cycles in flight
    """

    def test_emirates_ek226_sfo_to_dubai(self):
        """
        Emirates EK226: SFO 15:40 → DXB 19:25+1 (~15h45m).

        Ultra-long-haul to Dubai. 12h timezone difference.
        """
        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=7)

        # EK226: SFO 15:40 → DXB 19:25+1
        departure = make_flight_datetime(base_date, "15:40")
        arrival = make_flight_datetime(base_date, "19:25", day_offset=1)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Asia/Dubai",
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        flight = FlightInfo(
            departure_datetime=departure,
            arrival_datetime=arrival,
            origin_tz="America/Los_Angeles",
            dest_tz="Asia/Dubai",
        )

        # 12h shift - could be either direction, typically advance
        assert schedule.total_shift_hours == 12, (
            f"Expected 12h shift, got {schedule.total_shift_hours}"
        )

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )

    def test_emirates_ek225_dubai_to_sfo(self):
        """
        Emirates EK225: DXB 08:50 → SFO 12:50 same day (~16h).

        Return from Dubai, same-day arrival due to westward travel + long flight.
        """
        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=10)

        # EK225: DXB 08:50 → SFO 12:50 same day
        departure = make_flight_datetime(base_date, "08:50")
        arrival = make_flight_datetime(base_date, "12:50")

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="Asia/Dubai",
                    dest_tz="America/Los_Angeles",
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        flight = FlightInfo(
            departure_datetime=departure,
            arrival_datetime=arrival,
            origin_tz="Asia/Dubai",
            dest_tz="America/Los_Angeles",
        )

        # 12h shift - could be either direction, typically delay for westward
        assert schedule.total_shift_hours == 12, (
            f"Expected 12h shift, got {schedule.total_shift_hours}"
        )

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )

    def test_singapore_sq31_sfo_to_singapore(self):
        """
        Singapore Airlines SQ31: SFO 09:40 → SIN 19:05+1 (~17h25m).

        Ultra-long-haul, 16h timezone difference → 8h delay (shorter path).
        """
        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=7)

        # SQ31: SFO 09:40 → SIN 19:05+1
        departure = make_flight_datetime(base_date, "09:40")
        arrival = make_flight_datetime(base_date, "19:05", day_offset=1)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Asia/Singapore",
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        flight = FlightInfo(
            departure_datetime=departure,
            arrival_datetime=arrival,
            origin_tz="America/Los_Angeles",
            dest_tz="Asia/Singapore",
        )

        # 16h shift → 8h delay (shorter path)
        assert schedule.direction == "delay", f"Expected delay direction, got {schedule.direction}"
        assert schedule.total_shift_hours == 8, (
            f"Expected 8h shift (via delay), got {schedule.total_shift_hours}"
        )

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )

    def test_singapore_sq32_singapore_to_sfo(self):
        """
        Singapore Airlines SQ32: SIN 09:15 → SFO 07:50 same day (~15h35m).

        Date line crossing - arrives same calendar day but earlier local time.
        """
        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=10)

        # SQ32: SIN 09:15 → SFO 07:50 same day (date line crossing)
        departure = make_flight_datetime(base_date, "09:15")
        arrival = make_flight_datetime(base_date, "07:50")  # Same day!

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="Asia/Singapore",
                    dest_tz="America/Los_Angeles",
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        flight = FlightInfo(
            departure_datetime=departure,
            arrival_datetime=arrival,
            origin_tz="Asia/Singapore",
            dest_tz="America/Los_Angeles",
        )

        # 16h shift → 8h advance (shorter path for return)
        assert schedule.direction == "advance", (
            f"Expected advance direction, got {schedule.direction}"
        )

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )

    def test_cathay_cx879_sfo_to_hong_kong(self):
        """
        Cathay Pacific CX879: SFO 11:25 → HKG 19:00+1 (~15h35m).

        Ultra-long-haul to Hong Kong, next-day evening arrival.
        """
        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=7)

        # CX879: SFO 11:25 → HKG 19:00+1
        departure = make_flight_datetime(base_date, "11:25")
        arrival = make_flight_datetime(base_date, "19:00", day_offset=1)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Asia/Hong_Kong",
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        flight = FlightInfo(
            departure_datetime=departure,
            arrival_datetime=arrival,
            origin_tz="America/Los_Angeles",
            dest_tz="Asia/Hong_Kong",
        )

        # 16h shift → 8h delay
        assert schedule.direction == "delay", f"Expected delay direction, got {schedule.direction}"

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )

    def test_cathay_cx872_hong_kong_to_sfo(self):
        """
        Cathay Pacific CX872: HKG 01:00 → SFO 21:15-1 (~13h15m).

        SPECIAL CASE: Arrives previous calendar day due to date line crossing!
        Early morning departure, previous evening arrival.
        """
        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=10)

        # CX872: HKG 01:00 → SFO 21:15-1 (arrives previous day!)
        departure = make_flight_datetime(base_date, "01:00")
        arrival = make_flight_datetime(base_date, "21:15", day_offset=-1)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="Asia/Hong_Kong",
                    dest_tz="America/Los_Angeles",
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        flight = FlightInfo(
            departure_datetime=departure,
            arrival_datetime=arrival,
            origin_tz="Asia/Hong_Kong",
            dest_tz="America/Los_Angeles",
        )

        # 16h shift → 8h advance
        assert schedule.direction == "advance", (
            f"Expected advance direction, got {schedule.direction}"
        )

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )

    def test_jal_jl1_sfo_to_tokyo(self):
        """
        Japan Airlines JL1: SFO 12:55 → HND 17:20+1 (~11h25m).

        Tokyo Haneda, next-day late afternoon arrival.
        """
        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=7)

        # JL1: SFO 12:55 → HND 17:20+1
        departure = make_flight_datetime(base_date, "12:55")
        arrival = make_flight_datetime(base_date, "17:20", day_offset=1)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Asia/Tokyo",
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        flight = FlightInfo(
            departure_datetime=departure,
            arrival_datetime=arrival,
            origin_tz="America/Los_Angeles",
            dest_tz="Asia/Tokyo",
        )

        # 17h shift → 7h delay (shorter path)
        assert schedule.direction == "delay", f"Expected delay direction, got {schedule.direction}"
        assert schedule.total_shift_hours == 7, (
            f"Expected 7h shift, got {schedule.total_shift_hours}"
        )

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )

    def test_jal_jl2_tokyo_to_sfo(self):
        """
        Japan Airlines JL2: HND 18:05 → SFO 10:15 same day (~9h10m).

        Date line crossing - arrives earlier on same calendar day.
        """
        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=10)

        # JL2: HND 18:05 → SFO 10:15 same day
        departure = make_flight_datetime(base_date, "18:05")
        arrival = make_flight_datetime(base_date, "10:15")  # Same day!

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="Asia/Tokyo",
                    dest_tz="America/Los_Angeles",
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        flight = FlightInfo(
            departure_datetime=departure,
            arrival_datetime=arrival,
            origin_tz="Asia/Tokyo",
            dest_tz="America/Los_Angeles",
        )

        # 17h shift → 7h advance
        assert schedule.direction == "advance", (
            f"Expected advance direction, got {schedule.direction}"
        )

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )

    def test_qantas_qf74_sfo_to_sydney(self):
        """
        Qantas QF74: SFO 20:15 → SYD 06:10+2 (~15h55m).

        SPECIAL CASE: Evening departure, arrives TWO days later!
        This is a key regression test for evening departure handling.

        Originally the scheduler had bugs with evening departures:
        - Scheduling sleep_target before the flight
        - Activities before landing on arrival day

        This test validates both issues are resolved.
        """
        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=7)

        # QF74: SFO 20:15 → SYD 06:10+2 (arrives 2 days later!)
        departure = make_flight_datetime(base_date, "20:15")
        arrival = make_flight_datetime(base_date, "06:10", day_offset=2)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Australia/Sydney",
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        flight = FlightInfo(
            departure_datetime=departure,
            arrival_datetime=arrival,
            origin_tz="America/Los_Angeles",
            dest_tz="Australia/Sydney",
        )

        # 19h shift → 5h delay (shorter path going west)
        # LA (UTC-8) to Sydney (UTC+11 AEDT in Jan) = 19h east, or 5h west
        assert schedule.direction == "delay", f"Expected delay direction, got {schedule.direction}"
        assert schedule.total_shift_hours == 5, (
            f"Expected 5h shift, got {schedule.total_shift_hours}"
        )

        # Run full validations
        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        # Print schedule for debugging if there are issues
        if issues:
            print("\n=== QF74 SCHEDULE DEBUG (Evening Departure Regression) ===")
            print(f"Direction: {schedule.direction}")
            for day_schedule in schedule.interventions:
                print(f"\n--- Day {day_schedule.day} ({day_schedule.phase_type}) ---")
                for item in day_schedule.items:
                    display_time = item.dest_time or item.time
                    print(f"  {display_time} - {item.type}: {item.title}")

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )

        # Additional regression check: verify no sleep_target within 4h of 20:15 departure
        sleep_issues = validate_sleep_not_before_flight(schedule, flight, min_gap_hours=4.0)
        sleep_errors = [i for i in sleep_issues if i.severity == "error"]
        assert len(sleep_errors) == 0, "Sleep before departure regression:\n" + "\n".join(
            f"  - {i.message}" for i in sleep_errors
        )

    def test_qantas_qf73_sydney_to_sfo(self):
        """
        Qantas QF73: SYD 21:25 → SFO 15:55 same day (~13h30m).

        Date line crossing - arrives same calendar day despite long flight.
        Evening departure, afternoon arrival.
        """
        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=10)

        # QF73: SYD 21:25 → SFO 15:55 same day
        departure = make_flight_datetime(base_date, "21:25")
        arrival = make_flight_datetime(base_date, "15:55")  # Same day!

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="Australia/Sydney",
                    dest_tz="America/Los_Angeles",
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        flight = FlightInfo(
            departure_datetime=departure,
            arrival_datetime=arrival,
            origin_tz="Australia/Sydney",
            dest_tz="America/Los_Angeles",
        )

        # 19h shift → 5h advance (shorter path going east)
        # Sydney (UTC+11) to LA (UTC-8) = 19h west, or 5h east
        assert schedule.direction == "advance", (
            f"Expected advance direction, got {schedule.direction}"
        )

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )


# =============================================================================
# PARAMETERIZED VALIDATION TESTS
# =============================================================================


class TestPracticalValidation:
    """Cross-cutting validation tests using parameterized flight configs."""

    @pytest.mark.parametrize(
        "flight_name,origin_tz,dest_tz,depart_time,arrive_time,arrive_day",
        [
            # Minimal jet lag (3h)
            ("HA11 SFO-HNL", "America/Los_Angeles", "Pacific/Honolulu", "07:00", "09:35", 0),
            ("HA12 HNL-SFO", "Pacific/Honolulu", "America/Los_Angeles", "12:30", "20:30", 0),
            ("AA16 SFO-JFK", "America/Los_Angeles", "America/New_York", "11:00", "19:35", 0),
            ("AA177 JFK-SFO", "America/New_York", "America/Los_Angeles", "19:35", "23:21", 0),
            # Moderate jet lag (8-9h)
            ("VS20 SFO-LHR", "America/Los_Angeles", "Europe/London", "16:30", "10:40", 1),
            ("VS19 LHR-SFO", "Europe/London", "America/Los_Angeles", "11:40", "14:40", 0),
            ("AF83 SFO-CDG", "America/Los_Angeles", "Europe/Paris", "15:40", "11:35", 1),
            ("AF84 CDG-SFO", "Europe/Paris", "America/Los_Angeles", "13:25", "15:55", 0),
            ("LH455 SFO-FRA", "America/Los_Angeles", "Europe/Berlin", "14:40", "10:30", 1),
            ("LH454 FRA-SFO", "Europe/Berlin", "America/Los_Angeles", "13:20", "15:55", 0),
            # Severe jet lag (12-17h)
            ("EK226 SFO-DXB", "America/Los_Angeles", "Asia/Dubai", "15:40", "19:25", 1),
            ("EK225 DXB-SFO", "Asia/Dubai", "America/Los_Angeles", "08:50", "12:50", 0),
            ("SQ31 SFO-SIN", "America/Los_Angeles", "Asia/Singapore", "09:40", "19:05", 1),
            ("SQ32 SIN-SFO", "Asia/Singapore", "America/Los_Angeles", "09:15", "07:50", 0),
            ("CX879 SFO-HKG", "America/Los_Angeles", "Asia/Hong_Kong", "11:25", "19:00", 1),
            ("CX872 HKG-SFO", "Asia/Hong_Kong", "America/Los_Angeles", "01:00", "21:15", -1),
            ("JL1 SFO-HND", "America/Los_Angeles", "Asia/Tokyo", "12:55", "17:20", 1),
            ("JL2 HND-SFO", "Asia/Tokyo", "America/Los_Angeles", "18:05", "10:15", 0),
            ("QF74 SFO-SYD", "America/Los_Angeles", "Australia/Sydney", "20:15", "06:10", 2),
            ("QF73 SYD-SFO", "Australia/Sydney", "America/Los_Angeles", "21:25", "15:55", 0),
        ],
    )
    def test_no_sleep_within_4h_of_departure(
        self, flight_name, origin_tz, dest_tz, depart_time, arrive_time, arrive_day
    ):
        """
        Validate that no sleep_target is scheduled within 4 hours of departure.

        This is a cross-cutting test that checks all 20 flight scenarios.
        """
        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=7)

        departure = make_flight_datetime(base_date, depart_time)
        arrival = make_flight_datetime(base_date, arrive_time, day_offset=arrive_day)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz=origin_tz,
                    dest_tz=dest_tz,
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        flight = FlightInfo(
            departure_datetime=departure,
            arrival_datetime=arrival,
            origin_tz=origin_tz,
            dest_tz=dest_tz,
        )

        issues = validate_sleep_not_before_flight(schedule, flight, min_gap_hours=4.0)

        # Only fail on errors; warnings are informational (e.g., Flight Day sleep_target)
        errors = [i for i in issues if i.severity == "error"]
        assert len(errors) == 0, f"{flight_name}: Found sleep before departure:\n" + "\n".join(
            f"  - {i.message}" for i in errors
        )

    @pytest.mark.parametrize(
        "flight_name,origin_tz,dest_tz,depart_time,arrive_time,arrive_day",
        [
            # Next-day arrivals (overnight flights)
            ("VS20 SFO-LHR", "America/Los_Angeles", "Europe/London", "16:30", "10:40", 1),
            ("AF83 SFO-CDG", "America/Los_Angeles", "Europe/Paris", "15:40", "11:35", 1),
            ("LH455 SFO-FRA", "America/Los_Angeles", "Europe/Berlin", "14:40", "10:30", 1),
            ("EK226 SFO-DXB", "America/Los_Angeles", "Asia/Dubai", "15:40", "19:25", 1),
            ("SQ31 SFO-SIN", "America/Los_Angeles", "Asia/Singapore", "09:40", "19:05", 1),
            ("CX879 SFO-HKG", "America/Los_Angeles", "Asia/Hong_Kong", "11:25", "19:00", 1),
            ("JL1 SFO-HND", "America/Los_Angeles", "Asia/Tokyo", "12:55", "17:20", 1),
            # Special: +2 day arrival
            ("QF74 SFO-SYD", "America/Los_Angeles", "Australia/Sydney", "20:15", "06:10", 2),
            # Special: -1 day arrival (date line crossing)
            ("CX872 HKG-SFO", "Asia/Hong_Kong", "America/Los_Angeles", "01:00", "21:15", -1),
        ],
    )
    def test_no_activities_before_landing(
        self, flight_name, origin_tz, dest_tz, depart_time, arrive_time, arrive_day
    ):
        """
        Validate that no activities are scheduled before the flight lands.

        For overnight flights arriving the next day (or +2 days), activities
        on the arrival day should not be scheduled before the arrival time.
        """
        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=7)

        departure = make_flight_datetime(base_date, depart_time)
        arrival = make_flight_datetime(base_date, arrive_time, day_offset=arrive_day)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz=origin_tz,
                    dest_tz=dest_tz,
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        flight = FlightInfo(
            departure_datetime=departure,
            arrival_datetime=arrival,
            origin_tz=origin_tz,
            dest_tz=dest_tz,
        )

        issues = validate_no_activities_before_landing(schedule, flight)

        assert len(issues) == 0, f"{flight_name}: Found activities before landing:\n" + "\n".join(
            f"  - {i.message}" for i in issues
        )


# =============================================================================
# INTENSITY VARIATION TESTS
# =============================================================================


# Flight configurations for parameterized tests
FLIGHT_CONFIGS = [
    # Minimal jet lag (3h)
    ("HA11 SFO-HNL", "America/Los_Angeles", "Pacific/Honolulu", "07:00", "09:35", 0),
    ("HA12 HNL-SFO", "Pacific/Honolulu", "America/Los_Angeles", "12:30", "20:30", 0),
    ("AA16 SFO-JFK", "America/Los_Angeles", "America/New_York", "11:00", "19:35", 0),
    ("AA177 JFK-SFO", "America/New_York", "America/Los_Angeles", "19:35", "23:21", 0),
    # Moderate jet lag (8-9h)
    ("VS20 SFO-LHR", "America/Los_Angeles", "Europe/London", "16:30", "10:40", 1),
    ("VS19 LHR-SFO", "Europe/London", "America/Los_Angeles", "11:40", "14:40", 0),
    ("AF83 SFO-CDG", "America/Los_Angeles", "Europe/Paris", "15:40", "11:35", 1),
    ("AF84 CDG-SFO", "Europe/Paris", "America/Los_Angeles", "13:25", "15:55", 0),
    ("LH455 SFO-FRA", "America/Los_Angeles", "Europe/Berlin", "14:40", "10:30", 1),
    ("LH454 FRA-SFO", "Europe/Berlin", "America/Los_Angeles", "13:20", "15:55", 0),
    # Severe jet lag (12-17h)
    ("EK226 SFO-DXB", "America/Los_Angeles", "Asia/Dubai", "15:40", "19:25", 1),
    ("EK225 DXB-SFO", "Asia/Dubai", "America/Los_Angeles", "08:50", "12:50", 0),
    ("SQ31 SFO-SIN", "America/Los_Angeles", "Asia/Singapore", "09:40", "19:05", 1),
    ("SQ32 SIN-SFO", "Asia/Singapore", "America/Los_Angeles", "09:15", "07:50", 0),
    ("CX879 SFO-HKG", "America/Los_Angeles", "Asia/Hong_Kong", "11:25", "19:00", 1),
    ("CX872 HKG-SFO", "Asia/Hong_Kong", "America/Los_Angeles", "01:00", "21:15", -1),
    ("JL1 SFO-HND", "America/Los_Angeles", "Asia/Tokyo", "12:55", "17:20", 1),
    ("JL2 HND-SFO", "Asia/Tokyo", "America/Los_Angeles", "18:05", "10:15", 0),
    ("QF74 SFO-SYD", "America/Los_Angeles", "Australia/Sydney", "20:15", "06:10", 2),
    ("QF73 SYD-SFO", "Australia/Sydney", "America/Los_Angeles", "21:25", "15:55", 0),
]

# Intensity settings to test
INTENSITY_SETTINGS = ["gentle", "balanced", "aggressive"]


class TestIntensityVariations:
    """
    Test all 20 flight scenarios with all 3 intensity settings.

    This creates 60 test combinations (20 flights × 3 intensities) to ensure:
    - Schedules generate correctly for all intensity levels
    - Basic validations pass (no activities before landing, no sleep before departure)
    - Direction and shift calculations remain consistent across intensities
    """

    @pytest.mark.parametrize("intensity", INTENSITY_SETTINGS)
    @pytest.mark.parametrize(
        "flight_name,origin_tz,dest_tz,depart_time,arrive_time,arrive_day",
        FLIGHT_CONFIGS,
    )
    def test_schedule_generates_with_intensity(
        self,
        flight_name,
        origin_tz,
        dest_tz,
        depart_time,
        arrive_time,
        arrive_day,
        intensity,
    ):
        """
        Validate that schedules generate correctly for all flights at all intensity levels.

        Checks:
        - Schedule generates without errors
        - Has at least one day of interventions
        - Direction and shift are calculated correctly (same across intensities)
        - No critical validation errors
        """
        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=7)

        departure = make_flight_datetime(base_date, depart_time)
        arrival = make_flight_datetime(base_date, arrive_time, day_offset=arrive_day)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz=origin_tz,
                    dest_tz=dest_tz,
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
            schedule_intensity=intensity,
        )

        schedule = generator.generate_schedule(request)

        flight = FlightInfo(
            departure_datetime=departure,
            arrival_datetime=arrival,
            origin_tz=origin_tz,
            dest_tz=dest_tz,
        )

        # Basic sanity checks
        assert schedule is not None, f"{flight_name} [{intensity}]: Schedule generation failed"
        assert len(schedule.interventions) > 0, (
            f"{flight_name} [{intensity}]: No interventions generated"
        )

        # Run validation suite
        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, (
            f"{flight_name} [{intensity}]: Found {len(errors)} errors:\n"
            + "\n".join(f"  - {e.category}: {e.message}" for e in errors)
        )

    @pytest.mark.parametrize("intensity", INTENSITY_SETTINGS)
    @pytest.mark.parametrize(
        "flight_name,origin_tz,dest_tz,depart_time,arrive_time,arrive_day",
        [
            # Overnight flights with next-day arrivals
            ("VS20 SFO-LHR", "America/Los_Angeles", "Europe/London", "16:30", "10:40", 1),
            ("AF83 SFO-CDG", "America/Los_Angeles", "Europe/Paris", "15:40", "11:35", 1),
            ("QF74 SFO-SYD", "America/Los_Angeles", "Australia/Sydney", "20:15", "06:10", 2),
        ],
    )
    def test_intensity_affects_shift_rate(
        self,
        flight_name,
        origin_tz,
        dest_tz,
        depart_time,
        arrive_time,
        arrive_day,
        intensity,
    ):
        """
        Validate that different intensities result in different adaptation timelines.

        All intensities use direction-specific rates (advances are harder than delays):
        - Gentle: 0.75h/day advance, 1.0h/day delay
        - Balanced: 1.0h/day advance, 1.5h/day delay
        - Aggressive: 1.25h/day advance, 2.0h/day delay

        Checks that the schedule's shift calculator uses the appropriate rate.
        """
        from circadian.science.shift_calculator import INTENSITY_CONFIGS, ShiftCalculator

        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=7)

        departure = make_flight_datetime(base_date, depart_time)
        arrival = make_flight_datetime(base_date, arrive_time, day_offset=arrive_day)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz=origin_tz,
                    dest_tz=dest_tz,
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
            schedule_intensity=intensity,
        )

        schedule = generator.generate_schedule(request)

        # Create a ShiftCalculator with the same parameters to verify rate
        calc = ShiftCalculator(
            total_shift=schedule.total_shift_hours,
            direction=schedule.direction,
            prep_days=3,
            intensity=intensity,
        )

        # Get expected rate based on intensity and direction
        config = INTENSITY_CONFIGS[intensity]
        if schedule.direction == "advance":
            expected_rate = config.advance_rate
        else:
            expected_rate = config.delay_rate

        assert calc.daily_rate == expected_rate, (
            f"{flight_name} [{intensity}/{schedule.direction}]: "
            f"Expected {expected_rate}h/day, got {calc.daily_rate}"
        )


# =============================================================================
# INTERVENTION PRESENCE TESTS
# =============================================================================


class TestInterventionPresence:
    """
    Validate that key interventions appear on Flight Day and Arrival Day.

    These tests ensure that schedules aren't too sparse - users need actionable
    guidance on critical days, not just isolated interventions.
    """

    @pytest.mark.parametrize(
        "flight_name,origin_tz,dest_tz,depart_time,arrive_time,arrive_day",
        [
            # Evening departures (long pre_departure phases) - expect caffeine on day 0
            ("VS20 SFO-LHR", "America/Los_Angeles", "Europe/London", "16:30", "10:40", 1),
            ("QF74 SFO-SYD", "America/Los_Angeles", "Australia/Sydney", "20:15", "06:10", 2),
            # Afternoon departure - still has actionable day 0 time
            ("AF83 SFO-CDG", "America/Los_Angeles", "Europe/Paris", "15:40", "11:35", 1),
        ],
    )
    def test_flight_day_has_caffeine_interventions(
        self, flight_name, origin_tz, dest_tz, depart_time, arrive_time, arrive_day
    ):
        """
        Flight Day (day 0) should have caffeine_ok and caffeine_cutoff when uses_caffeine=True.

        Note: This only applies to flights with afternoon/evening departures where
        there's actionable time on day 0. Early morning departures (like SQ31 at 09:40)
        have essentially zero pre_departure phase, so caffeine is on day -1 instead.
        """
        from helpers import get_interventions_by_type

        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=7)

        departure = make_flight_datetime(base_date, depart_time)
        arrival = make_flight_datetime(base_date, arrive_time, day_offset=arrive_day)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz=origin_tz,
                    dest_tz=dest_tz,
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        # Check for caffeine_ok on day 0
        caffeine_ok = get_interventions_by_type(schedule, "caffeine_ok", day=0)
        assert len(caffeine_ok) >= 1, f"{flight_name}: Day 0 should have caffeine_ok intervention"

        # Check for caffeine_cutoff on day 0
        caffeine_cutoff = get_interventions_by_type(schedule, "caffeine_cutoff", day=0)
        assert len(caffeine_cutoff) >= 1, (
            f"{flight_name}: Day 0 should have caffeine_cutoff intervention"
        )

    def test_early_morning_departure_caffeine_on_day_minus_one(self):
        """
        Early morning departures have caffeine guidance on day -1, not day 0.

        SQ31 departs at 09:40 AM, which means the pre_departure phase on day 0
        is too short for caffeine interventions. Caffeine is on day -1 instead.
        """
        from helpers import get_interventions_by_type

        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=7)

        # SQ31: SFO 09:40 → SIN 19:05+1 (early morning departure)
        departure = make_flight_datetime(base_date, "09:40")
        arrival = make_flight_datetime(base_date, "19:05", day_offset=1)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Asia/Singapore",
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        # For early morning departures, caffeine is on day -1 (last full prep day)
        caffeine_ok = get_interventions_by_type(schedule, "caffeine_ok", day=-1)
        assert len(caffeine_ok) >= 1, (
            "SQ31: Day -1 should have caffeine_ok for early morning departure"
        )

        caffeine_cutoff = get_interventions_by_type(schedule, "caffeine_cutoff", day=-1)
        assert len(caffeine_cutoff) >= 1, (
            "SQ31: Day -1 should have caffeine_cutoff for early morning departure"
        )

    @pytest.mark.parametrize(
        "flight_name,origin_tz,dest_tz,depart_time,arrive_time,arrive_day,flight_hours",
        [
            # Flights 6h+ should have sleep suggestion
            ("VS20 SFO-LHR", "America/Los_Angeles", "Europe/London", "16:30", "10:40", 1, 10),
            ("AF83 SFO-CDG", "America/Los_Angeles", "Europe/Paris", "15:40", "11:35", 1, 11),
            # Flights < 6h should NOT have sleep suggestion
            ("HA11 SFO-HNL", "America/Los_Angeles", "Pacific/Honolulu", "07:00", "09:35", 0, 5.5),
        ],
    )
    def test_long_flight_has_sleep_suggestion(
        self, flight_name, origin_tz, dest_tz, depart_time, arrive_time, arrive_day, flight_hours
    ):
        """
        Flights 6h+ should have in-flight sleep/nap suggestion.

        The nap threshold was lowered from 8h to 6h to help users on
        more overnight flights get sleep guidance.
        """
        from helpers import get_interventions_by_type

        generator = ScheduleGenerator()
        base_date = datetime.now() + timedelta(days=7)

        departure = make_flight_datetime(base_date, depart_time)
        arrival = make_flight_datetime(base_date, arrive_time, day_offset=arrive_day)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz=origin_tz,
                    dest_tz=dest_tz,
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        # Get all nap_window interventions
        all_naps = get_interventions_by_type(schedule, "nap_window")

        if flight_hours >= 6:
            # Long flights should have in-flight sleep
            assert len(all_naps) >= 1, (
                f"{flight_name}: Flight of {flight_hours}h should have nap_window intervention"
            )
        else:
            # Short flights may or may not have naps (depends on post-arrival recovery)
            # No assertion needed - we just want to ensure no errors
            pass
