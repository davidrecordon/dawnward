# Flight Schedule Analysis: Science Answers & Implementation Specifications

This document provides authoritative answers to questions raised during the 20-flight analysis, along with implementation specifications for product decisions.

---

## Science Questions

### 1. Wake/Sleep Targets Outside Phase Windows

**Answer: Correct behavior — not a bug**

The "phase window" (e.g., `04:50 - 05:50`) represents the **CBTmin window** (core body temperature minimum), the mathematical anchor of the Forger99 model. CBTmin typically occurs 2-3 hours *before* natural wake time.

Wake/sleep targets are **behavioral outputs** derived from the circadian phase — naturally offset by many hours from CBTmin:
- If CBTmin = 05:00 → natural wake ≈ 07:00-08:00
- If CBTmin = 05:00 → natural sleep ≈ 22:00-23:00

**Implementation**: Do not display raw phase windows to users. They are internal model state for debugging only. The frontend should only show wake target, sleep target, and intervention windows.

**No code changes needed** — just ensure phase windows aren't exposed in UI.

---

### 2. In-Flight Interventions

**Answer: Build a dedicated in-flight intervention generator**

The current system filters interventions that fall during the flight, but this leaves a gap. Users need specific in-flight guidance that accounts for what's practical on a plane.

#### Architecture

The **in-flight generator** runs as a post-processor after the main phase scheduler:

```
Phase Scheduler (existing)
    ↓
    generates interventions for all phases including flight window
    ↓
In-Flight Generator (new)
    ↓
    1. Extracts interventions that fall during flight
    2. Transforms them using destination-time logic
    3. Filters for what's practical on a plane
    4. Returns flight-specific intervention cards
```

#### Core Algorithm: Destination-Time Mapping

The key insight: **every in-flight recommendation derives from "what time is it at the destination right now?"**

For any moment during the flight, compute destination local time:

```
destination_time = departure_time + flight_elapsed + timezone_difference
```

Then categorize into periods:

| Destination Time | Category | On-Plane Behavior |
|------------------|----------|-------------------|
| 22:00 - 06:00 | Night | Sleep window — eye mask, recline, no screens |
| 06:00 - 10:00 | Morning | Wake — open shade, light OK, caffeine OK |
| 10:00 - 16:00 | Midday | Stay awake — light OK, activity |
| 16:00 - 19:00 | Late afternoon | Stay awake — start reducing light |
| 19:00 - 22:00 | Evening | Wind down — dim screens, no caffeine |

#### Example: SFO → London (8h advance, 10h flight)

```
Depart: 8:45 PM PST
Arrive: 3:00 PM GMT next day
Timezone diff: +8h

Flight timeline with destination time:

Elapsed    PST           London         Recommendation
────────────────────────────────────────────────────────
0:00       8:45 PM   →   4:45 AM        Sleep (night)
2:00       10:45 PM  →   6:45 AM        Wake up (morning)
4:00       12:45 AM  →   8:45 AM        Stay awake, caffeine OK
6:00       2:45 AM   →   10:45 AM       Stay awake
8:00       4:45 AM   →   12:45 PM       Stay awake
10:00      7:00 AM   →   3:00 PM        Arrive
```

**Generated in-flight cards:**

```
┌─────────────────────────────────────────────────────────┐
│  🌙  Sleep window                     0:00 - 2:00       │
│      It's night in London. Use eye mask, try to sleep. │
├─────────────────────────────────────────────────────────┤
│  ☀️  Wake up                          ~2:00 into flight │
│      London morning — open shade for light exposure.   │
├─────────────────────────────────────────────────────────┤
│  ☕  Caffeine OK                       after waking     │
│      You're landing mid-afternoon; coffee won't        │
│      disrupt tonight's sleep.                          │
└─────────────────────────────────────────────────────────┘
```

#### Example: SFO → Tokyo (8h delay, 11h flight)

```
Depart: 1:00 PM PST
Arrive: 4:30 PM JST next day
Timezone diff: +17h

Elapsed    PST           Tokyo          Recommendation
────────────────────────────────────────────────────────
0:00       1:00 PM   →   6:00 AM+1      Morning — stay awake
3:00       4:00 PM   →   9:00 AM        Morning — caffeine OK
6:00       7:00 PM   →   12:00 PM       Midday — stay awake
9:00       10:00 PM  →   3:00 PM        Afternoon — stay awake
11:00      12:00 AM  →   4:30 PM        Arrive
```

**Generated in-flight cards:**

```
┌─────────────────────────────────────────────────────────┐
│  ☀️  Stay awake                       entire flight     │
│      It's daytime in Tokyo throughout. Resist the      │
│      urge to sleep — you'll thank yourself tonight.    │
├─────────────────────────────────────────────────────────┤
│  ☕  Caffeine OK                       throughout       │
│      Landing in late afternoon; coffee helps you       │
│      stay awake and won't hurt tonight's sleep.        │
├─────────────────────────────────────────────────────────┤
│  💡  Keep shade open                  when possible    │
│      Light exposure reinforces your destination time.  │
└─────────────────────────────────────────────────────────┘
```

#### Example: SFO → Dubai (12h shift, landing evening)

```
Depart: 4:30 PM PST
Arrive: 7:30 PM GST next day  
Flight: 16h

Elapsed    PST           Dubai          Recommendation
────────────────────────────────────────────────────────
0:00       4:30 PM   →   4:30 AM        Night — sleep OK
3:00       7:30 PM   →   7:30 AM        Morning — wake
6:00       10:30 PM  →   10:30 AM       Midday — stay awake
10:00      2:30 AM   →   2:30 PM        Afternoon — stay awake
13:00      5:30 AM   →   5:30 PM        Late PM — wind down
16:00      8:30 AM   →   7:30 PM        Arrive (evening)
```

**Generated in-flight cards:**

```
┌─────────────────────────────────────────────────────────┐
│  🌙  Sleep window                     0:00 - 3:00       │
│      It's night in Dubai. Good time to sleep.          │
├─────────────────────────────────────────────────────────┤
│  ☀️  Wake up                          ~3:00 into flight │
│      Dubai morning — open shade, have breakfast.       │
├─────────────────────────────────────────────────────────┤
│  ☕  Caffeine cutoff                   10:00 into flight│
│      Landing in evening — stop caffeine ~6h before     │
│      to protect tonight's sleep.                       │
├─────────────────────────────────────────────────────────┤
│  🌅  Wind down                        last 3 hours     │
│      Dim screens, relax — you'll want to sleep         │
│      within a few hours of landing.                    │
└─────────────────────────────────────────────────────────┘
```

#### Intervention Types for In-Flight

| Intervention | When to Include | Logic |
|--------------|-----------------|-------|
| **Sleep window** | Flight overlaps destination 22:00-06:00 | Show start/end in elapsed time |
| **Wake cue** | After sleep window ends | Destination hits ~06:00 |
| **Stay awake** | Flight is entirely destination daytime | No sleep window needed |
| **Caffeine OK** | Landing before ~16:00 destination | Won't disrupt arrival night |
| **Caffeine cutoff** | Landing after ~16:00 destination | Calculate 6h before landing |
| **Light/shade** | Always | Open during destination day, closed during night |
| **Wind down** | Landing destination evening (18:00-23:00) | Last 2-3h of flight |
| **Melatonin** | If scheduler placed it during flight AND it aligns with sleep window | Keep timing, add context |

#### Edge Cases

**Short flights (<5h)**: Minimal guidance needed.
- If entirely destination daytime: "Short flight — stay awake, caffeine OK"
- If crossing into destination night: "Try to rest if you can"

**Red-eye with no destination-night overlap**: Flight is entirely during destination day despite being overnight locally.
- Emphasize "Stay awake — it's daytime at your destination"
- Suggest short nap (20-30 min max) only if user will be severely sleep deprived

**Very long flights (>14h)**: May span two destination "nights." 
- Prioritize one consolidated sleep block, usually the one closest to arrival
- Explain: "One longer sleep is better than two short ones"

**Split sleep windows**: Sometimes destination night is split across flight (e.g., lands at 3 AM destination).
- Show the window that gives most sleep before landing
- Note: "You may want to sleep again shortly after arrival"

#### Implementation Notes

The in-flight generator needs:
- `departure_time` (local)
- `arrival_time` (local)
- `departure_timezone`
- `arrival_timezone`  
- `interventions_during_flight` (from phase scheduler)
- `user_preferences` (melatonin enabled, etc.)

Output: List of in-flight intervention cards with:
- `elapsed_time` (primary display: "2:00 into flight")
- `destination_time` (secondary: "6:45 AM London")
- `type` (sleep, wake, caffeine, light, melatonin, wind_down)
- `title` and `description`

---

### 3. Adaptation Day Estimates Asymmetry

**Answer: Asymmetry is scientifically real, but current estimates appear too aggressive**

**Biological basis**: Human circadian period averages ~24.2h (range 24.0-24.5h), so we naturally drift later without zeitgebers. Delaying aligns with this; advancing fights it.

**Literature-supported rates**:

| Direction | Without intervention | With optimal intervention |
|-----------|---------------------|---------------------------|
| Delay (westward) | 1.0-1.5h/day | 1.5-2.5h/day |
| Advance (eastward) | 0.3-0.5h/day | 0.5-1.5h/day |

**Recommended formula** (conservative, assumes ~70% user compliance):

| Direction | Rate with interventions |
|-----------|------------------------|
| Delay | 1.5h/day |
| Advance | 1.0h/day |

**Corrected estimates**:

| Shift | Direction | Current | Corrected |
|-------|-----------|---------|-----------|
| 7h | delay | 1 day | 5 days |
| 8h | delay | 2 days | 6 days |
| 12h | delay | 4 days | 8 days |
| 12h | advance | 8 days | 12 days |

**Important**: These assume continued intervention at destination. Pre-departure prep helps but doesn't eliminate arrival jet lag.

---

### 4. Missing Light Interventions on Prep Days

**Answer: Bug — light window should be based on wake_target, not normal wake time**

For advance schedules, morning light is the **primary intervention** (per Khalsa PRC). It should not be filtered because it falls before the user's "normal" wake time.

**Root cause**: The constraint filter likely compares light timing against `user.normal_wake_time` rather than the day's `wake_target`. 

**Fix**: For prep days, calculate light window relative to that day's `wake_target`:
- Advance: Light window starts at `wake_target`, duration 30-60 min
- Delay: Light window is evening, 1-3h before `sleep_target`

**Verification**: After fix, every advance prep day should have:
1. Morning light intervention (within 1h of wake_target)
2. Afternoon/evening melatonin intervention

---

### 5. Melatonin Timing Gap (7+ hours before sleep)

**Answer: Timing is correct — update messaging to explain PRC logic**

Melatonin timing is relative to **current CBTmin**, not target sleep time. This is correct per the phase response curve literature.

For advancing:
- Melatonin must hit the "advance zone" of the PRC (5-8h before current CBTmin)
- If CBTmin = 05:00, taking melatonin at 14:00 (2 PM) is optimal
- This is hours before bedtime by design

**Updated description**:

Current (confusing):
> "Take 0.5mg fast-release melatonin. This helps advance your circadian clock for eastward travel."

Better:
> "Take 0.5mg fast-release melatonin now. This timing shifts your body clock earlier — it's not meant to make you sleepy right now."

**Optional**: Add expandable "Why this time?" with brief PRC explanation.

---

## Product Decisions

### 6 & 7. Schedule Intensity (Aggressiveness)

**Decision: Three modes with segmented control UI**

#### Mode Specifications

| Parameter | Gentle | Balanced | Aggressive |
|-----------|--------|----------|------------|
| Max shift/day | 1.0h | 1.25h | 1.5h |
| Wake floor | 5:30 AM | 5:00 AM | None |
| Sleep ceiling | Midnight | 1:00 AM | None |
| Target user | Work/family constraints | Most travelers | Flexible schedule |

**Default**: Balanced (for all users initially; signed-in preference later)

#### UI

Use segmented control (same style as "Recommend naps"):

```
Schedule intensity

┌─────────┬──────────┬────────────┐
│ Gentle  │ Balanced │ Aggressive │
└─────────┴──────────┴────────────┘

Helper text (updates based on selection):
- Gentle: "Easier to follow — wake no earlier than 5:30 AM, sleep by midnight"
- Balanced: "Good balance of speed and practicality"  
- Aggressive: "Fastest adaptation — requires flexible schedule"
```

#### Example: SFO → London (8h advance), 3 prep days, normal wake 7:00 AM

| Day | Gentle | Balanced | Aggressive |
|-----|--------|----------|------------|
| Day -3 | 6:00 AM | 5:45 AM | 5:30 AM |
| Day -2 | 5:30 AM | 5:00 AM | 4:00 AM |
| Day -1 | 5:30 AM (floor) | 5:00 AM (floor) | 2:30 AM |
| Day 0 | 5:30 AM (floor) | 5:00 AM (floor) | 1:00 AM |
| **Total shifted** | 1.5h | 2h | 6h |
| **Remaining at arrival** | 6.5h | 6h | 2h |

#### Example: SFO → Tokyo (8h delay), 3 prep days, normal sleep 10:00 PM

| Day | Gentle | Balanced | Aggressive |
|-----|--------|----------|------------|
| Day -3 | 11:00 PM | 11:15 PM | 11:30 PM |
| Day -2 | 12:00 AM (ceiling) | 12:30 AM | 1:00 AM |
| Day -1 | 12:00 AM (ceiling) | 1:00 AM (ceiling) | 2:30 AM |
| Day 0 | 12:00 AM (ceiling) | 1:00 AM (ceiling) | 4:00 AM |
| **Total shifted** | 2h | 3h | 6h |

---

### 8. Shift Threshold Tiering

**Decision: 5-tier system with differentiated UI treatment**

#### Tier Definitions

| Tier | Shift | Label | Default Prep | Strategy |
|------|-------|-------|--------------|----------|
| Minimal | 0-2h | "Minor adjustment" | 0 days | Tips card only |
| Light | 3h | "Light shift" | 2 days | Simplified schedule |
| Moderate | 4-6h | "Moderate shift" | 3 days | Full schedule |
| Significant | 7-9h | "Significant shift" | 5 days | Full schedule + warnings |
| Severe | 10-12h | "Major shift" | 7 days | Full schedule + direction choice |

#### Tier: Minimal (0-2h)

Don't generate a day-by-day schedule. Show a single tips card:

```
┌─────────────────────────────────────────────────────────┐
│  ✨  Minor Time Change                                  │
│      2 hours · No prep needed                          │
├─────────────────────────────────────────────────────────┤
│  Your body will adjust naturally within 1-2 days.      │
│                                                         │
│  Tips for arrival:                                      │
│  • Get sunlight in the morning                         │
│  • Avoid napping after 3 PM local                      │
│  • Keep first night's bedtime close to usual           │
└─────────────────────────────────────────────────────────┘
```

#### Tier: Light (3h)

Generate schedule but with simplified messaging and explicit skip option:

```
┌─────────────────────────────────────────────────────────┐
│  Light Preparation                                      │
│  3 hour shift · 2 days prep                            │
├─────────────────────────────────────────────────────────┤
│  [Normal schedule cards...]                            │
├─────────────────────────────────────────────────────────┤
│  Skip prep? That's fine — you'll adjust within         │
│  2-3 days at your destination.                         │
└─────────────────────────────────────────────────────────┘
```

Only include light and melatonin interventions (no caffeine optimization for light shifts).

#### Tier: Moderate (4-6h)

Full schedule with all interventions. This is the default experience — no special messaging needed.

#### Tier: Significant (7-9h)

Full schedule plus:

**Prep days warning** (if user selects fewer than recommended):
```
┌─────────────────────────────────────────────────────────┐
│  ⚠️  Extended Preparation Recommended                   │
│                                                         │
│  For a 7-hour shift, we recommend 5 days of prep.      │
│  With 3 days, you'll arrive with ~4 hours of jet lag.  │
│                                                         │
│  [Add more prep days]                                   │
└─────────────────────────────────────────────────────────┘
```

**Arrival adaptation note**:
```
┌─────────────────────────────────────────────────────────┐
│  📍  After You Arrive                                   │
│                                                         │
│  Even with preparation, expect 3-4 days to fully       │
│  adjust. Continue morning light and consistent         │
│  sleep times at your destination.                      │
└─────────────────────────────────────────────────────────┘
```

#### Tier: Severe (10-12h)

For ~12h shifts, advance vs delay becomes ambiguous. Add direction choice:

```
┌─────────────────────────────────────────────────────────┐
│  Major Time Shift: 12 hours                            │
├─────────────────────────────────────────────────────────┤
│  Two approaches:                                        │
│                                                         │
│  → Advance (shift earlier)                             │
│    ~12 days to fully adapt                             │
│    Better if you're a morning person                   │
│                                                         │
│  → Delay (shift later)                                 │
│    ~8 days to fully adapt                              │
│    Better if you're a night owl                        │
│                                                         │
│  [Let us choose]  [I'll pick: Advance / Delay]         │
└─────────────────────────────────────────────────────────┘
```

Default to whichever direction is shorter (usually delay). Include both the prep warning and arrival adaptation messaging from Significant tier.

---

### 9. Goals vs Actions Display

**Decision: No changes — current design handles this well**

The existing UI differentiates through **language**, not visual separation:

| Type | Title | Description starts with |
|------|-------|------------------------|
| Target | "Target wake time" | "Try to..." / "Aim to..." |
| Action | "Take melatonin" | "Take..." |
| Cutoff | "Caffeine cutoff" | "Avoid..." / "No..." |

The card design is unified; the copy does the work.

**Minor enhancement** (optional): For extreme targets (>2h from normal), add a subtle note below the description:
> "Earlier than usual — this is optimal for your eastward shift"

---

## Summary of Required Changes

| # | Type | Change |
|---|------|--------|
| 1 | Science | None — don't expose phase windows to UI |
| 2 | Science | Build in-flight intervention generator (see detailed spec above) |
| 3 | Science | Update adaptation rate: 1.5h/day delay, 1.0h/day advance |
| 4 | Science | Fix light window to use wake_target, not normal_wake |
| 5 | Science | Update melatonin description copy |
| 6/7 | Product | Add schedule intensity setting (segmented control, default Balanced) |
| 8 | Product | Implement 5-tier system with differentiated UI per tier |
| 9 | Product | No changes needed |

---

## Files to Modify

```
api/_python/circadian/
├── scheduler_v2.py               # Tier detection, intensity config
├── in_flight_generator.py        # NEW: in-flight intervention logic
├── scheduling/
│   ├── intervention_planner.py   # Light window fix (#4)
│   └── adaptation_estimator.py   # Rate formula (#3)

lib/
├── interventions.ts              # Melatonin descriptions (#5)

components/
├── TripForm.tsx                  # Schedule intensity selector (#6/7)
├── TripSchedule.tsx              # Tier-based rendering (#8)
└── InFlightPhase.tsx             # NEW: in-flight card rendering (#2)
```
