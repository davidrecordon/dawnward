# Realistic Flight Schedule Analysis: Science & Product Questions

After running 20 verified flight schedules through the Dawnward jet lag scheduler, several questions emerged that require expert input on circadian science and product decisions.

## Context

- **Flights analyzed**: 20 real-world routes from SFO (minimal 2-3h, moderate 8-9h, severe 5-12h shifts)
- **Scheduler**: Phase-based `ScheduleGeneratorV2` using Forger99 circadian model
- **Prep days**: 3 days before departure
- **User preferences**: 07:00 wake, 22:00 sleep, uses melatonin and caffeine

---

## Science Questions

### 1. Wake/Sleep Targets Outside Phase Windows

**Observation**: Pre-departure phases show wake_target and sleep_target times that fall completely outside the phase's "available for interventions" window.

**Examples**:
- EK225 Day 0: Phase `04:50 - 05:50`, but wake_target `13:00`, sleep_target `04:00`
- SQ31 Day 0: Phase `05:40 - 06:40`, but wake_target `13:00`, sleep_target `04:00`
- VS19 Day 0: Phase `07:00 - 08:40`, but wake_target `13:00`, sleep_target `04:00`

**Question**: Are these targets meant to be:
- (A) **Circadian goals** - the scientifically optimal times that inform other interventions, even if unachievable on that day?
- (B) **A bug** - should targets be clamped to within the phase window?
- (C) **Informational** - showing users where their body clock "wants" to be, even if they can't hit it?

If (A) or (C), how should the frontend display these? Currently they appear as normal intervention items, which may confuse users.

---

### 2. Sleep Target Displayed After Departure (User on Plane)

**Observation**: For afternoon departures, sleep_target times fall AFTER departure:

| Flight | Departs | sleep_target | Issue |
|--------|---------|--------------|-------|
| VS20 | 16:30 | 18:00 | User on plane for 10+ hours |
| AF83 | 15:40 | 18:00 | User on plane |
| LH455 | 14:40 | 18:00 | User on plane |

The 4-hour departure filter correctly removes sleep targets within 4h of departure, but these targets are MORE than 4h after departure (when the user has already left).

**Question**: Should sleep_target be filtered when:
- (A) It falls during the flight window (departure to arrival)?
- (B) The in-transit phase has its own sleep opportunities (ULR naps)?
- (C) It should be converted to "Goal sleep time" for reference only?

---

### 3. Adaptation Day Estimates Appear Inconsistent

**Observation**: The asymmetry between advance and delay estimates seems extreme:

| Flight | Shift | Direction | Est. Days | Notes |
|--------|-------|-----------|-----------|-------|
| JL1 SFO→HND | 7h | delay | 1 day | Only 1 day for 7h? |
| SQ31 SFO→SIN | 8h | delay | 2 days | Low for 8h |
| EK225 DXB→SFO | 12h | delay | 4 days | Low for 12h |
| EK226 SFO→DXB | 12h | advance | 8 days | Correct per ~1.5h/day |

**Question**: Is this asymmetry scientifically accurate?
- Does the literature support 2x faster adaptation for delays?
- If yes, what is the biological basis?
- If no, should the delay estimation be revised?

---

### 4. Missing Light Interventions on Some Prep Days

**Observation**: For advance schedules, several prep days have no `light_seek` intervention:
- HA12 Day -3, -2: Only melatonin scheduled, no light
- Science impact notes: "4 light intervention(s) adjusted due to travel constraints"

**Question**: What causes light interventions to be filtered on prep days?
- Is morning light falling before the user's normal wake time?
- Should we recommend "early light" even if it means waking slightly earlier than the phase start?
- For advance, is afternoon/evening melatonin sufficient without morning light?

---

### 5. Melatonin Timing Gap

**Observation**: Some schedules show melatonin 7+ hours before sleep target:

| Day | Melatonin | Sleep Target | Gap |
|-----|-----------|--------------|-----|
| VS20 Day -3 | 14:00 | 21:00 | 7h |
| AF83 Day -3 | 14:00 | 21:00 | 7h |

**Question**: Is this timing relative to CBT_min rather than sleep onset?
- Literature suggests melatonin ~5h before bedtime
- If timing is PRC-based, should user messaging clarify this?
- Should the description say "Take now to shift your clock" vs "Take 5h before bed"?

---

## Product Decisions

### 6. Aggressive Early Wake Times for Advance Schedules

**Observation**: Prep days for advance schedules require very early waking:

| Flight | Shift | Day -1 Wake | Day 0 Wake |
|--------|-------|-------------|------------|
| AA16 | 3h | 04:00 | 04:00 |
| VS20 | 8h | 04:00 | 03:00 |
| EK226 | 12h | 04:00 | 03:00 |
| QF73 | 5h | 04:00 | 03:00 |

**Trade-off**: Optimal circadian shifting vs. user compliance

**Options**:
- (A) **Keep as-is** - scientifically optimal, trust users to adapt or ignore
- (B) **Add "Gentle Mode"** - accept slower adaptation (1h/day instead of 1.5h) for more reasonable times
- (C) **Cap minimum wake time** - e.g., never earlier than 05:00, with warning about slower adaptation
- (D) **Make prep_days adjustable** - let users trade more days for gentler shifting

**Recommendation needed**: What's the right balance between science-optimal and user-achievable?

---

### 7. Very Late Sleep Targets for Delay Schedules

**Observation**: Delay prep schedules push sleep very late:

| Flight | Shift | Day -1 Sleep |
|--------|-------|--------------|
| VS19, AF84, LH454, EK225, SQ31, CX879, JL1, QF74 | 7-12h | 02:30 AM |

**Trade-off**: Optimal circadian shifting vs. user obligations (work, family)

**Options**:
- (A) **Keep as-is** - scientifically optimal, users can partially comply
- (B) **Add "Gentle Mode"** - cap at midnight, extend adaptation timeline
- (C) **Split the difference** - cap at 01:00 as compromise
- (D) **Context-aware** - ask user about work schedule, adjust accordingly

**Recommendation needed**: Is 02:30 AM sleep realistically achievable for most users?

---

### 8. Minimal Shifts May Not Warrant Aggressive Prep

**Observation**: For a 3h shift (AA16 SFO→JFK), the schedule requires:
- Day -2: 05:00 AM wake
- Day -1: 04:00 AM wake
- Day 0: 04:00 AM wake

**Question**: Is this level of disruption worth it for a 3h shift?
- Many travelers "power through" domestic jet lag without intervention
- The cost (severe sleep disruption) may exceed the benefit (3h faster adaptation)

**Options**:
- (A) **Keep as-is** - consistent methodology regardless of shift size
- (B) **Simplify for small shifts** - e.g., ≤3h shifts get "light suggestions only" with no aggressive wake shifting
- (C) **Add "quick tips" mode** - for minimal shifts, just show arrival-day recommendations
- (D) **Ask user preference** - "Do you want full optimization or just key tips?"

**Recommendation needed**: Where is the threshold for "worth the prep disruption"?

---

### 9. How to Present Targets vs. Actions

**Context**: Some interventions are "target times" (wake_target, sleep_target) while others are "actions" (light_seek, melatonin, caffeine_cutoff).

**Current behavior**: All are displayed as equal items in the schedule.

**Problem**: Users may interpret "sleep_target: 02:30" as "I must sleep at 2:30 AM" rather than "Aim for 2:30 AM if possible."

**Options**:
- (A) **Visual differentiation** - style targets differently (dimmer, different icon, "Goal" prefix)
- (B) **Separate sections** - "Your Goals" section vs "Actions to Take" section
- (C) **Conditional display** - only show targets if user enables "Show circadian goals"
- (D) **Inline qualification** - "Aim for 02:30 AM (adjust if needed)" in the description

**Recommendation needed**: How should the frontend distinguish aspirational targets from concrete actions?

---

## Summary

| # | Type | Question | Impact |
|---|------|----------|--------|
| 1 | Science | Targets outside phase windows | UX clarity |
| 2 | Science | Sleep target after departure | Logic correctness |
| 3 | Science | Adaptation day asymmetry | User expectations |
| 4 | Science | Missing light interventions | Schedule completeness |
| 5 | Science | Melatonin timing gap | User messaging |
| 6 | Product | 3-4 AM wake times | User compliance |
| 7 | Product | 2:30 AM sleep targets | User compliance |
| 8 | Product | Minimal shift aggressiveness | Cost/benefit |
| 9 | Product | Targets vs actions display | UX design |

---

## Reference Data

Flight analysis script: `api/_python/scripts/analyze_flights.py`

Full schedule output saved to: `/tmp/flight_analysis.txt` (2042 lines)

Key files:
- `api/_python/circadian/scheduler_v2.py` - Main scheduler
- `api/_python/circadian/scheduling/intervention_planner.py` - Intervention timing
- `api/_python/circadian/scheduling/constraint_filter.py` - Constraint application
- `api/_python/circadian/science/` - Circadian science calculations
