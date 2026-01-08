"""
Circadian phase calculations.

Estimates circadian markers (CBTmin, DLMO) from habitual sleep schedule
and calculates timezone shifts.
"""

from datetime import datetime, time

import pytz


def parse_time(time_str: str) -> time:
    """Parse "HH:MM" string to time object."""
    parts = time_str.split(":")
    return time(int(parts[0]), int(parts[1]))


def time_to_minutes(t: time) -> int:
    """Convert time to minutes since midnight."""
    return t.hour * 60 + t.minute


def minutes_to_time(minutes: int) -> time:
    """Convert minutes since midnight to time (handles wrap-around)."""
    minutes = minutes % (24 * 60)
    return time(minutes // 60, minutes % 60)


def format_time(t: time) -> str:
    """Format time as "HH:MM" (24-hour format for data fields)."""
    return f"{t.hour:02d}:{t.minute:02d}"


def format_time_12h(t: time) -> str:
    """Format time as "H:MM AM/PM" (12-hour format for user-facing text)."""
    hour = t.hour
    period = "AM" if hour < 12 else "PM"
    if hour == 0:
        hour = 12
    elif hour > 12:
        hour -= 12
    return f"{hour}:{t.minute:02d} {period}"


def get_current_datetime_in_tz(tz_name: str) -> datetime:
    """
    Get current datetime in the specified timezone.

    This is critical for Vercel deployment where datetime.now() returns UTC.
    We need to know "now" in the origin timezone since that's where the user
    is located during prep days.

    Args:
        tz_name: IANA timezone name (e.g., "America/Los_Angeles")

    Returns:
        Current datetime in the specified timezone (naive, for local comparisons)
    """
    tz = pytz.timezone(tz_name)
    now_utc = datetime.now(pytz.UTC)
    now_local = now_utc.astimezone(tz)
    # Return naive datetime for consistent comparisons with departure times
    return now_local.replace(tzinfo=None)


def estimate_cbtmin_from_wake(wake_time: str) -> time:
    """
    Estimate Core Body Temperature minimum (CBTmin) from habitual wake time.

    CBTmin typically occurs 2-3 hours before habitual wake time.
    Using 2.5 hours as the midpoint estimate.

    Scientific basis: Czeisler & Gooley 2007

    Args:
        wake_time: "HH:MM" format (e.g., "07:00")

    Returns:
        Estimated CBTmin time (e.g., 04:30 for 07:00 wake)
    """
    wake = parse_time(wake_time)
    wake_minutes = time_to_minutes(wake)
    cbtmin_minutes = wake_minutes - 150  # 2.5 hours = 150 minutes
    return minutes_to_time(cbtmin_minutes)


def estimate_dlmo_from_sleep(sleep_time: str) -> time:
    """
    Estimate Dim Light Melatonin Onset (DLMO) from habitual sleep time.

    DLMO typically occurs ~2 hours before habitual sleep onset.

    Scientific basis: Burgess et al. 2010

    Args:
        sleep_time: "HH:MM" format (e.g., "23:00")

    Returns:
        Estimated DLMO time (e.g., 21:00 for 23:00 sleep)
    """
    sleep = parse_time(sleep_time)
    sleep_minutes = time_to_minutes(sleep)
    dlmo_minutes = sleep_minutes - 120  # 2 hours = 120 minutes
    return minutes_to_time(dlmo_minutes)


def get_timezone_offset_hours(tz_name: str, reference_date: datetime = None) -> float:
    """
    Get UTC offset in hours for a timezone at a given date.

    Args:
        tz_name: IANA timezone name (e.g., "America/Los_Angeles")
        reference_date: Date to check offset (for DST), defaults to now

    Returns:
        Offset in hours (e.g., -8.0 for PST, -7.0 for PDT)
    """
    if reference_date is None:
        reference_date = datetime.now()

    tz = pytz.timezone(tz_name)
    localized = tz.localize(reference_date.replace(tzinfo=None))
    offset_seconds = localized.utcoffset().total_seconds()
    return offset_seconds / 3600


def calculate_timezone_shift(
    origin_tz: str, dest_tz: str, reference_date: datetime = None
) -> tuple[float, str]:
    """
    Calculate the timezone shift and optimal direction for adaptation.

    For shifts > 12 hours, chooses the easier direction:
    - Delays (westward) are easier than advances (eastward)
    - Natural circadian period is ~24.2h, so delays align with drift

    Args:
        origin_tz: Origin IANA timezone
        dest_tz: Destination IANA timezone
        reference_date: Date to calculate offset (for DST handling)

    Returns:
        Tuple of (shift_hours, direction)
        - shift_hours: Positive = eastward/advance, Negative = westward/delay
        - direction: "advance" or "delay"
    """
    if reference_date is None:
        reference_date = datetime.now()

    origin_offset = get_timezone_offset_hours(origin_tz, reference_date)
    dest_offset = get_timezone_offset_hours(dest_tz, reference_date)

    # Raw shift: positive = eastward (need to advance), negative = westward (need to delay)
    raw_shift = dest_offset - origin_offset

    # For shifts > 12h, consider going "around the world" the other way
    if raw_shift > 12:
        # Going west instead of east might be easier
        alt_shift = raw_shift - 24  # Negative = delay
        # Delays are easier (max ~2h/day) vs advances (max ~1.5h/day)
        if abs(alt_shift) / 2.0 < raw_shift / 1.5:
            raw_shift = alt_shift
    elif raw_shift < -12:
        # Going east instead of west might be faster
        alt_shift = raw_shift + 24  # Positive = advance
        if alt_shift / 1.5 < abs(raw_shift) / 2.0:
            raw_shift = alt_shift

    direction = "advance" if raw_shift > 0 else "delay"
    return (raw_shift, direction)


def calculate_actual_prep_days(
    departure_datetime: str, requested_prep_days: int, current_datetime: datetime = None
) -> int:
    """
    Auto-adjust prep days if departure is sooner than requested.

    Args:
        departure_datetime: ISO format departure time
        requested_prep_days: User's requested prep days (1-7)
        current_datetime: Current time (defaults to now)

    Returns:
        Actual prep days to use (minimum 0)
    """
    if current_datetime is None:
        current_datetime = datetime.now()

    departure = datetime.fromisoformat(departure_datetime.replace("Z", "+00:00"))
    if departure.tzinfo is None:
        departure = departure.replace(tzinfo=None)
        current_datetime = current_datetime.replace(tzinfo=None)

    # Compare dates (not datetimes) to count calendar days until departure
    # This ensures "today" counts as a prep day if departure is tomorrow
    days_until_departure = (departure.date() - current_datetime.date()).days

    # Can't have more prep days than days until departure
    actual_prep_days = min(requested_prep_days, max(0, days_until_departure))

    return actual_prep_days


def calculate_daily_shift_targets(
    total_shift: float, direction: str, prep_days: int
) -> list[dict[str, float]]:
    """
    Calculate target phase shift for each day using adaptive algorithm.

    More prep days = gentler daily shifts (better for circadian health).

    From backend-design.md:
    - prep_days >= 5: max 1.0 h/day (very gentle)
    - prep_days >= 3: max 1.5 h/day (moderate, research-supported)
    - prep_days < 3: max 2.0 h/day (aggressive but safe)

    Args:
        total_shift: Total hours to shift (absolute value)
        direction: "advance" or "delay"
        prep_days: Number of prep days

    Returns:
        List of cumulative shift targets for each day
    """
    abs_shift = abs(total_shift)

    # Determine max daily shift based on prep days and direction
    if direction == "advance":
        # Advances are harder - physiological max ~1.5h/day
        if prep_days >= 5:
            max_daily = 1.0
        elif prep_days >= 3:
            max_daily = 1.5
        else:
            max_daily = 1.5  # Don't exceed 1.5 for advances
    else:
        # Delays are easier - physiological max ~2h/day
        if prep_days >= 5:
            max_daily = 1.0
        elif prep_days >= 3:
            max_daily = 1.5
        else:
            max_daily = 2.0

    # Total days = prep + flight day + 2 arrival buffer days
    total_days = prep_days + 3
    ideal_daily = abs_shift / total_days
    actual_daily = min(ideal_daily, max_daily)

    # Generate cumulative targets
    targets = []
    cumulative = 0.0
    day = -prep_days

    while cumulative < abs_shift:
        remaining = abs_shift - cumulative
        daily_shift = min(actual_daily, remaining)
        cumulative += daily_shift
        targets.append({"day": day, "daily_shift": daily_shift, "cumulative_shift": cumulative})
        day += 1

    return targets


def shift_time(base_time: time, hours: float) -> time:
    """
    Shift a time by a number of hours.

    Args:
        base_time: Starting time
        hours: Hours to shift (positive = later, negative = earlier)

    Returns:
        Shifted time (wraps around midnight)
    """
    base_minutes = time_to_minutes(base_time)
    shift_minutes = int(hours * 60)
    new_minutes = base_minutes + shift_minutes
    return minutes_to_time(new_minutes)
