"""
Realistic Flight Scenario Tests

Test the scheduler against real-world flight schedules to catch practical issues
that theoretical tests miss. Uses actual departure/arrival times from major airlines.

Flight schedules sourced from:
- British Airways, Virgin Atlantic (SFO-LHR)
- Air France (SFO-CDG)
- Singapore Airlines (SFO-SIN)
- Cathay Pacific (SFO-HKG)
"""

import pytest
from datetime import datetime, timedelta

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent))

from helpers import (
    FlightInfo,
    ValidationIssue,
    validate_sleep_not_before_flight,
    validate_no_activities_before_landing,
    validate_daily_sleep_opportunity,
    validate_sleep_wake_order,
    run_all_validations,
)
from circadian.types import TripLeg, ScheduleRequest
from circadian.scheduler_v2 import ScheduleGeneratorV2

# Use the phase-based scheduler (v2) which fixes flight timing issues
ScheduleGenerator = ScheduleGeneratorV2


def make_flight_datetime(base_date: datetime, time_str: str, day_offset: int = 0) -> datetime:
    """Create a datetime from a base date, time string, and day offset."""
    hour, minute = map(int, time_str.split(":"))
    return (base_date + timedelta(days=day_offset)).replace(
        hour=hour, minute=minute, second=0, microsecond=0
    )


class TestSFOToLondon:
    """SFO -> LHR: 8h advance, overnight eastward flights."""

    def test_virgin_vs20_evening_departure(self):
        """
        Virgin Atlantic VS20: Depart 16:30 PST, arrive 10:40 GMT +1 day (~10h10m).

        This is a typical evening departure that arrives mid-morning in London.
        Key checks:
        - No sleep_target in the 4h before 16:30 departure
        - Day 1 activities should be after 10:40 arrival
        """
        generator = ScheduleGenerator()
        base_date = datetime(2026, 1, 15)

        # VS20: SFO 16:30 -> LHR 10:40+1
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

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )

    def test_british_airways_late_night_departure(self):
        """
        British Airways: Depart 23:30 PST, arrive ~17:58 GMT +1 day (~10h28m).

        Late-night departure, afternoon arrival. This is tricky because:
        - Sleep before a 23:30 flight could be reasonable (short nap)
        - But full sleep_target implies going to bed, which conflicts with flight
        """
        generator = ScheduleGenerator()
        base_date = datetime(2026, 1, 15)

        # BA: SFO 23:30 -> LHR 17:58+1
        departure = make_flight_datetime(base_date, "23:30")
        arrival = make_flight_datetime(base_date, "17:58", day_offset=1)

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

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )


class TestSFOToParis:
    """SFO -> CDG: 9h advance, overnight eastward flights."""

    def test_air_france_afternoon_departure(self):
        """
        Air France: Depart 13:50 PST, arrive ~09:25 CET +1 day (~10h35m).

        Early afternoon departure, morning arrival in Paris.
        User has a full day ahead after arrival.
        """
        generator = ScheduleGenerator()
        base_date = datetime(2026, 1, 15)

        # AF: SFO 13:50 -> CDG 09:25+1
        departure = make_flight_datetime(base_date, "13:50")
        arrival = make_flight_datetime(base_date, "09:25", day_offset=1)

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

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )

    def test_air_france_evening_departure(self):
        """
        Air France: Depart 20:25 PST, arrive ~15:00 CET +1 day (~10h35m).

        Evening departure, afternoon arrival. Different scheduling challenge.
        """
        generator = ScheduleGenerator()
        base_date = datetime(2026, 1, 15)

        # AF: SFO 20:25 -> CDG 15:00+1
        departure = make_flight_datetime(base_date, "20:25")
        arrival = make_flight_datetime(base_date, "15:00", day_offset=1)

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

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )


class TestSFOToAsia:
    """Long-haul flights to Asia (delay direction due to >12h timezone diff)."""

    def test_singapore_sq31(self):
        """
        Singapore Airlines SQ31: Depart 09:40 PST, arrive 19:05 SGT +1 day (~17h25m).

        Ultra-long haul flight. 16h timezone difference = 8h delay (westward equivalent).
        Flight is so long it crosses multiple sleep cycles.
        """
        generator = ScheduleGenerator()
        base_date = datetime(2026, 1, 15)

        # SQ31: SFO 09:40 -> SIN 19:05+1
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

        # For this long flight, we expect delay direction
        assert schedule.direction == "delay", f"Expected delay direction, got {schedule.direction}"

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )

    def test_cathay_cx879_to_hong_kong(self):
        """
        Cathay Pacific CX879: Depart 11:25 PST, arrive 19:00 HKT +1 day (~15h35m).

        Another ultra-long haul. Similar to Singapore but different time window.
        """
        generator = ScheduleGenerator()
        base_date = datetime(2026, 1, 15)

        # CX879: SFO 11:25 -> HKG 19:00+1
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

        # For this long flight, we expect delay direction
        assert schedule.direction == "delay", f"Expected delay direction, got {schedule.direction}"

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )


class TestReturnFlights:
    """Westward return flights (delay direction, easier adaptation)."""

    def test_virgin_vs19_lhr_to_sfo(self):
        """
        Virgin Atlantic VS19: Depart 11:00 GMT, arrive 14:00 PST same day (~11h).

        Westward return - arrive same calendar day due to timezone gain.
        User has a long afternoon/evening ahead at destination.
        """
        generator = ScheduleGenerator()
        base_date = datetime(2026, 1, 20)

        # VS19: LHR 11:00 -> SFO 14:00 same day
        departure = make_flight_datetime(base_date, "11:00")
        arrival = make_flight_datetime(base_date, "14:00")  # Same day!

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

        # Westward = delay direction
        assert schedule.direction == "delay", f"Expected delay direction, got {schedule.direction}"

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )

    def test_air_france_cdg_to_sfo(self):
        """
        Air France: Depart 10:30 CET, arrive 12:30 PST same day (~11h).

        Paris to SF return. 9h delay direction.
        """
        generator = ScheduleGenerator()
        base_date = datetime(2026, 1, 20)

        # AF: CDG 10:30 -> SFO 12:30 same day
        departure = make_flight_datetime(base_date, "10:30")
        arrival = make_flight_datetime(base_date, "12:30")  # Same day

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

        # Westward = delay direction
        assert schedule.direction == "delay", f"Expected delay direction, got {schedule.direction}"

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )


class TestPracticalValidation:
    """Cross-cutting validation tests using parameterized flight configs."""

    @pytest.mark.parametrize("flight_name,origin_tz,dest_tz,depart_time,arrive_time,arrive_day", [
        # Eastward (advance) flights
        ("VS20 SFO-LHR", "America/Los_Angeles", "Europe/London", "16:30", "10:40", 1),
        ("BA SFO-LHR late", "America/Los_Angeles", "Europe/London", "23:30", "17:58", 1),
        ("AF SFO-CDG early", "America/Los_Angeles", "Europe/Paris", "13:50", "09:25", 1),
        ("AF SFO-CDG late", "America/Los_Angeles", "Europe/Paris", "20:25", "15:00", 1),
        # Westward (delay) flights
        ("VS19 LHR-SFO", "Europe/London", "America/Los_Angeles", "11:00", "14:00", 0),
        ("AF CDG-SFO", "Europe/Paris", "America/Los_Angeles", "10:30", "12:30", 0),
        # Ultra long-haul (delay direction)
        ("SQ31 SFO-SIN", "America/Los_Angeles", "Asia/Singapore", "09:40", "19:05", 1),
        ("CX879 SFO-HKG", "America/Los_Angeles", "Asia/Hong_Kong", "11:25", "19:00", 1),
    ])
    def test_no_sleep_within_4h_of_departure(
        self, flight_name, origin_tz, dest_tz, depart_time, arrive_time, arrive_day
    ):
        """
        Validate that no sleep_target is scheduled within 4 hours of departure.

        This is a cross-cutting test that checks all flight scenarios.
        """
        generator = ScheduleGenerator()
        base_date = datetime(2026, 1, 15)

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

    @pytest.mark.parametrize("flight_name,origin_tz,dest_tz,depart_time,arrive_time,arrive_day", [
        # Eastward arrivals (check day 1 activities)
        ("VS20 SFO-LHR", "America/Los_Angeles", "Europe/London", "16:30", "10:40", 1),
        ("AF SFO-CDG early", "America/Los_Angeles", "Europe/Paris", "13:50", "09:25", 1),
        ("AF SFO-CDG late", "America/Los_Angeles", "Europe/Paris", "20:25", "15:00", 1),
        ("SQ31 SFO-SIN", "America/Los_Angeles", "Asia/Singapore", "09:40", "19:05", 1),
        ("CX879 SFO-HKG", "America/Los_Angeles", "Asia/Hong_Kong", "11:25", "19:00", 1),
    ])
    def test_no_activities_before_landing(
        self, flight_name, origin_tz, dest_tz, depart_time, arrive_time, arrive_day
    ):
        """
        Validate that no activities are scheduled before the flight lands.

        For overnight flights arriving the next day, activities on day 1 should
        not be scheduled before the arrival time.
        """
        generator = ScheduleGenerator()
        base_date = datetime(2026, 1, 15)

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


class TestUserProvidedScenario:
    """Test the specific scenario from the user's initial request."""

    def test_sfo_lhr_evening_departure_user_scenario(self):
        """
        User-provided scenario: SFO to LHR
        - Departure: 8:45pm PST (20:45)
        - Arrival: 3:15pm GMT +1 day (15:15)

        This was the original test case that revealed issues:
        - Day 0: sleep_target at 17:30 but flight departs at 20:45
        - Day 1: sleep_target at 00:00 GMT but flight lands at 15:15 GMT
        """
        generator = ScheduleGenerator()
        base_date = datetime(2026, 1, 10)

        # User scenario: SFO 20:45 -> LHR 15:15+1
        departure = make_flight_datetime(base_date, "20:45")
        arrival = make_flight_datetime(base_date, "15:15", day_offset=1)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Europe/London",
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
                )
            ],
            prep_days=2,  # User specified 2 prep days
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

        issues = run_all_validations(schedule, flight)
        errors = [i for i in issues if i.severity == "error"]
        warnings = [i for i in issues if i.severity == "warning"]

        # Print schedule for debugging if there are issues
        if issues:
            print("\n=== SCHEDULE DEBUG ===")
            print(f"Direction: {schedule.direction}")
            for day_schedule in schedule.interventions:
                print(f"\n--- Day {day_schedule.day} ({day_schedule.timezone}) ---")
                for item in day_schedule.items:
                    print(f"  {item.time} - {item.type}: {item.title}")

        assert len(errors) == 0, f"Found {len(errors)} errors:\n" + "\n".join(
            f"  - {e.category}: {e.message}" for e in errors
        )
