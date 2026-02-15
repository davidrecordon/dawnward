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

## ~~Cross-dateline phase ordering in merged schedules~~ (Fixed)

**Severity:** High
**Discovered:** 2026-02-15
**Fixed:** 2026-02-15 (#25)

### Problem (Resolved)

For same-day cross-dateline flights (e.g., CX 870 HKG→SFO, departs Feb 15, arrives Feb 15), interventions appeared in the wrong order on the schedule view. Pre-departure items could appear after post-arrival items, and within-phase sorting was incorrect.

Two bugs in the TypeScript display layer (`schedule-utils.ts` and `day-section.tsx`):

1. **`mergePhasesByDate()` didn't sort by phase type.** The comparator returned 0 when phases differed, relying on insertion order instead of explicitly sorting by `PHASE_ORDER`. This broke when multiple phases merged into a single calendar day.

2. **Within-phase sorting used `dest_time` for all phases.** For pre-departure items on cross-dateline flights, `dest_time` could be numerically larger than post-arrival `dest_time` (e.g., HKG→SFO with a 16-hour offset), causing incorrect chronological ordering.

### Fix Applied

- Sort by `PHASE_ORDER` when phases differ (preparation → pre_departure → in_transit → post_arrival → adaptation)
- Use `origin_time` for pre-flight phase sorting, `dest_time` for post-flight phase sorting — matching `getDisplayTime()` logic
- Applied the same fix to `DaySection` component rendering

---

## Known Limitations

### Multi-leg trips use aim-through fallback

**Severity:** Low (uncommon use case)
**Location:** `phase_generator.py:_generate_partial_adaptation_phases`, `_generate_restart_phases`

Two multi-leg strategies are stubbed but not yet implemented:

1. **Partial adaptation** (48-96h layover): Should partially adapt to layover timezone while maintaining trajectory toward final destination. Currently falls back to aim-through (treats the final destination as the only target).

2. **Restart logic** (>96h layover or opposite-direction legs): Should treat each leg as an independent trip. For example, NYC→London→LA should generate separate adaptation schedules for each leg. Currently falls back to aim-through.

Users hitting these scenarios get a functional schedule, but it won't account for intermediate timezone adaptation opportunities or the compounding effects of multi-leg travel.
