"""
Analyze all 20 realistic flights through the scheduler.

Outputs full schedules for manual review and analysis.
"""

import sys
from datetime import datetime, timedelta
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from circadian.scheduler_v2 import ScheduleGeneratorV2
from circadian.types import ScheduleRequest, TripLeg


def make_flight_datetime(base_date: datetime, time_str: str, day_offset: int = 0) -> datetime:
    """Create a datetime from a base date, time string, and day offset."""
    hour, minute = map(int, time_str.split(":"))
    return (base_date + timedelta(days=day_offset)).replace(
        hour=hour, minute=minute, second=0, microsecond=0
    )


# All 20 flights organized by severity
FLIGHTS = [
    # Minimal jet lag (2-3h)
    {
        "name": "HA11",
        "route": "SFO→HNL",
        "origin_tz": "America/Los_Angeles",
        "dest_tz": "Pacific/Honolulu",
        "depart": "07:00",
        "arrive": "09:35",
        "day_offset": 0,
        "category": "minimal",
    },
    {
        "name": "HA12",
        "route": "HNL→SFO",
        "origin_tz": "Pacific/Honolulu",
        "dest_tz": "America/Los_Angeles",
        "depart": "12:30",
        "arrive": "20:30",
        "day_offset": 0,
        "category": "minimal",
    },
    {
        "name": "AA16",
        "route": "SFO→JFK",
        "origin_tz": "America/Los_Angeles",
        "dest_tz": "America/New_York",
        "depart": "11:00",
        "arrive": "19:35",
        "day_offset": 0,
        "category": "minimal",
    },
    {
        "name": "AA177",
        "route": "JFK→SFO",
        "origin_tz": "America/New_York",
        "dest_tz": "America/Los_Angeles",
        "depart": "19:35",
        "arrive": "23:21",
        "day_offset": 0,
        "category": "minimal",
    },
    # Moderate jet lag (8-9h)
    {
        "name": "VS20",
        "route": "SFO→LHR",
        "origin_tz": "America/Los_Angeles",
        "dest_tz": "Europe/London",
        "depart": "16:30",
        "arrive": "10:40",
        "day_offset": 1,
        "category": "moderate",
    },
    {
        "name": "VS19",
        "route": "LHR→SFO",
        "origin_tz": "Europe/London",
        "dest_tz": "America/Los_Angeles",
        "depart": "11:40",
        "arrive": "14:40",
        "day_offset": 0,
        "category": "moderate",
    },
    {
        "name": "AF83",
        "route": "SFO→CDG",
        "origin_tz": "America/Los_Angeles",
        "dest_tz": "Europe/Paris",
        "depart": "15:40",
        "arrive": "11:35",
        "day_offset": 1,
        "category": "moderate",
    },
    {
        "name": "AF84",
        "route": "CDG→SFO",
        "origin_tz": "Europe/Paris",
        "dest_tz": "America/Los_Angeles",
        "depart": "13:25",
        "arrive": "15:55",
        "day_offset": 0,
        "category": "moderate",
    },
    {
        "name": "LH455",
        "route": "SFO→FRA",
        "origin_tz": "America/Los_Angeles",
        "dest_tz": "Europe/Berlin",
        "depart": "14:40",
        "arrive": "10:30",
        "day_offset": 1,
        "category": "moderate",
    },
    {
        "name": "LH454",
        "route": "FRA→SFO",
        "origin_tz": "Europe/Berlin",
        "dest_tz": "America/Los_Angeles",
        "depart": "13:20",
        "arrive": "15:55",
        "day_offset": 0,
        "category": "moderate",
    },
    # Severe jet lag (5-12h via shorter path)
    {
        "name": "EK226",
        "route": "SFO→DXB",
        "origin_tz": "America/Los_Angeles",
        "dest_tz": "Asia/Dubai",
        "depart": "15:40",
        "arrive": "19:25",
        "day_offset": 1,
        "category": "severe",
    },
    {
        "name": "EK225",
        "route": "DXB→SFO",
        "origin_tz": "Asia/Dubai",
        "dest_tz": "America/Los_Angeles",
        "depart": "08:50",
        "arrive": "12:50",
        "day_offset": 0,
        "category": "severe",
    },
    {
        "name": "SQ31",
        "route": "SFO→SIN",
        "origin_tz": "America/Los_Angeles",
        "dest_tz": "Asia/Singapore",
        "depart": "09:40",
        "arrive": "19:05",
        "day_offset": 1,
        "category": "severe",
    },
    {
        "name": "SQ32",
        "route": "SIN→SFO",
        "origin_tz": "Asia/Singapore",
        "dest_tz": "America/Los_Angeles",
        "depart": "09:15",
        "arrive": "07:50",
        "day_offset": 0,
        "category": "severe",
    },
    {
        "name": "CX879",
        "route": "SFO→HKG",
        "origin_tz": "America/Los_Angeles",
        "dest_tz": "Asia/Hong_Kong",
        "depart": "11:25",
        "arrive": "19:00",
        "day_offset": 1,
        "category": "severe",
    },
    {
        "name": "CX872",
        "route": "HKG→SFO",
        "origin_tz": "Asia/Hong_Kong",
        "dest_tz": "America/Los_Angeles",
        "depart": "01:00",
        "arrive": "21:15",
        "day_offset": -1,
        "category": "severe",
    },
    {
        "name": "JL1",
        "route": "SFO→HND",
        "origin_tz": "America/Los_Angeles",
        "dest_tz": "Asia/Tokyo",
        "depart": "12:55",
        "arrive": "17:20",
        "day_offset": 1,
        "category": "severe",
    },
    {
        "name": "JL2",
        "route": "HND→SFO",
        "origin_tz": "Asia/Tokyo",
        "dest_tz": "America/Los_Angeles",
        "depart": "18:05",
        "arrive": "10:15",
        "day_offset": 0,
        "category": "severe",
    },
    {
        "name": "QF74",
        "route": "SFO→SYD",
        "origin_tz": "America/Los_Angeles",
        "dest_tz": "Australia/Sydney",
        "depart": "20:15",
        "arrive": "06:10",
        "day_offset": 2,
        "category": "severe",
    },
    {
        "name": "QF73",
        "route": "SYD→SFO",
        "origin_tz": "Australia/Sydney",
        "dest_tz": "America/Los_Angeles",
        "depart": "21:25",
        "arrive": "15:55",
        "day_offset": 0,
        "category": "severe",
    },
]


def run_flight(flight: dict, base_date: datetime, prep_days: int = 3) -> dict:
    """Run a single flight through the scheduler and return results."""
    generator = ScheduleGeneratorV2()

    departure = make_flight_datetime(base_date, flight["depart"])
    arrival = make_flight_datetime(base_date, flight["arrive"], day_offset=flight["day_offset"])

    request = ScheduleRequest(
        legs=[
            TripLeg(
                origin_tz=flight["origin_tz"],
                dest_tz=flight["dest_tz"],
                departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M"),
            )
        ],
        prep_days=prep_days,
        wake_time="07:00",
        sleep_time="22:00",
        uses_melatonin=True,
        uses_caffeine=True,
    )

    schedule = generator.generate_schedule(request)

    return {
        "flight": flight,
        "departure": departure,
        "arrival": arrival,
        "schedule": schedule,
    }


def format_schedule(result: dict) -> str:
    """Format a schedule result for display."""
    flight = result["flight"]
    schedule = result["schedule"]
    departure = result["departure"]
    arrival = result["arrival"]

    lines = []
    lines.append("=" * 70)
    lines.append(f"FLIGHT: {flight['name']} {flight['route']}")
    lines.append(f"Category: {flight['category'].upper()}")
    lines.append(f"Departure: {departure.strftime('%Y-%m-%d %H:%M')} ({flight['origin_tz']})")
    lines.append(f"Arrival: {arrival.strftime('%Y-%m-%d %H:%M')} ({flight['dest_tz']})")
    lines.append(f"Direction: {schedule.direction} | Shift: {schedule.total_shift_hours}h")
    lines.append(f"Estimated adaptation: {schedule.estimated_adaptation_days} days")
    if schedule._science_impact_internal:
        lines.append(f"Science impact: {schedule._science_impact_internal}")
    lines.append("=" * 70)

    for day_schedule in schedule.interventions:
        phase_info = f" [{day_schedule.phase_type}]" if day_schedule.phase_type else ""
        lines.append(
            f"\nDay {day_schedule.day} ({day_schedule.date}, {day_schedule.timezone}){phase_info}"
        )
        if day_schedule.phase_start and day_schedule.phase_end:
            # Add (+1) indicator when phase spans midnight
            end_str = day_schedule.phase_end
            if day_schedule.phase_spans_midnight:
                end_str += " (+1)"
            lines.append(f"  Phase window: {day_schedule.phase_start} - {end_str}")
        lines.append("-" * 50)

        for item in day_schedule.items:
            duration_info = f" ({item.duration_min} min)" if item.duration_min else ""
            window_info = f" [until {item.window_end}]" if item.window_end else ""
            lines.append(f"  {item.time} - {item.type}: {item.title}{duration_info}{window_info}")
            # Truncate description for readability
            desc = item.description[:80] + "..." if len(item.description) > 80 else item.description
            lines.append(f"           {desc}")

    lines.append("")
    return "\n".join(lines)


def main():
    base_date = datetime(2026, 1, 15)

    # Group by category
    categories = {"minimal": [], "moderate": [], "severe": []}

    for flight in FLIGHTS:
        result = run_flight(flight, base_date)
        categories[flight["category"]].append(result)

    # Print all results
    for category in ["minimal", "moderate", "severe"]:
        print("\n" + "#" * 70)
        print(f"# {category.upper()} JET LAG FLIGHTS")
        print("#" * 70)

        for result in categories[category]:
            print(format_schedule(result))


if __name__ == "__main__":
    main()
