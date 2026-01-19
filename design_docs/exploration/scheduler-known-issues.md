# Scheduler Known Issues

Issues identified in the Python scheduler that should be addressed in future work.

---

## Pre-departure interventions after flight departure

**Severity:** Medium
**Discovered:** 2026-01-18 (Calendar Phase 2)

### Problem

The scheduler generates pre-departure phase interventions that occur after the flight has already departed. For example:

- **VS20 SFO→LHR**: Flight departs at 16:30 LA time
- Scheduler creates `sleep_target` at 18:00 LA time on departure day
- User will be on the plane at 18:00, so this intervention is impossible

### Expected Behavior

Pre-departure interventions should be filtered to only include times before the flight departure. The scheduler should either:

1. Not generate interventions that fall after departure time
2. Filter them out during phase generation
3. Move the sleep_target to the in-transit phase if appropriate

### Affected Flights

Most noticeable on eastbound overnight flights where the shifted sleep time approaches or exceeds the departure time:

- VS20 SFO→LHR (16:30 departure, creates 18:00 sleep_target)
- Similar pattern likely on other eastbound transatlantic flights

### Location in Code

The pre-departure phase is generated in `api/_python/circadian/scheduling/phase_generator.py`. The filtering logic would need to compare intervention times against the departure datetime.

### Workaround

Users can ignore pre-departure sleep_target events that occur after their departure time. The calendar sync will still create these events, but they can be manually deleted.

---

## Future Issues

(Add additional scheduler issues here as they're discovered)
