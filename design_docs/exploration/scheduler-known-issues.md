# Scheduler Known Issues

Issues identified in the Python scheduler that should be addressed in future work.

---

## ~~Pre-departure interventions after flight departure~~ (Fixed)

**Severity:** Medium
**Discovered:** 2026-01-18 (Calendar Phase 2)
**Fixed:** 2026-02-02

### Problem (Resolved)

The scheduler generated pre-departure phase interventions that occurred after the flight had already departed. For example, VS20 SFO→LHR (16:30 departure) would create a `sleep_target` at 18:00.

### Fix Applied

Two layers of fixes now handle this:

1. **Sleep target capping** (`intervention_planner.py:_cap_sleep_target_for_departure`): Caps or omits sleep_target when within 4h of departure. Omitted sleep guidance moves to "After Landing" section via `_include_post_arrival_sleep_in_flight_day()`.

2. **Overnight flight detection** (`phase_generator.py:_is_overnight_flight`): For red-eye flights (departing 7 PM–1 AM, arriving morning), the pre-departure sleep_target is always omitted and replaced with full-flight sleep guidance in the in-transit phase. This prevents impractical recommendations like "sleep at 6:30 PM" before a 9:30 PM departure.

### Remaining Edge Case

Late afternoon transatlantic flights (departing 5-7 PM) are NOT classified as overnight, so they still use the capping logic. For VS20 (4:30 PM), sleep_target is omitted because the phase ends at 1:30 PM (3h before departure) and the circadian target (~7 PM) is after that. This is correct behavior — the user gets sleep guidance in "After Landing" instead. If users report issues with this window, consider adding circadian-aligned sleep detection (Option B from the original analysis).

---

## Future Issues

(Add additional scheduler issues here as they're discovered)
