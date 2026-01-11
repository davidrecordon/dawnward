# User Preferences Implementation Spec

## New Preferences to Implement

### 1. Caffeine Cutoff

**Purpose:** Caffeine metabolism varies dramatically between individuals due to CYP1A2 polymorphisms. Fast metabolizers can comfortably drink coffee 6 hours before bed; slow metabolizers need 10-12 hours. Unlike most circadian parameters, people accurately self-assess their caffeine sensitivity.

**Schema field:** `caffeineCutoffHours` (already exists, update default from 6 → 8)

```prisma
caffeineCutoffHours Int @default(8)
```

**Options:**

| Value | Label      | Description                                       |
| ----- | ---------- | ------------------------------------------------- |
| 6     | "6 hours"  | Fast metabolizer — coffee rarely affects my sleep |
| 8     | "8 hours"  | Average — I'm moderately sensitive                |
| 10    | "10 hours" | Sensitive — evening coffee keeps me up            |
| 12    | "12 hours" | Very sensitive — I avoid caffeine after morning   |

**Default:** 8 hours

**UI:**

- Setting label: "Caffeine cutoff before bed"
- Helper note: "We'll stop suggesting caffeine this many hours before your target sleep time. Most people know if they're sensitive — trust your experience."
- Component: Radio buttons or segmented control with hours prominent, description as secondary text

**Backend integration:**

- Currently hardcoded at line 593 in `intervention_planner.py` as 600 min (10h)
- Pass `caffeine_cutoff_hours` from user preferences to schedule generation
- Convert to minutes: `cutoff_minutes = caffeine_cutoff_hours * 60`

---

### 2. Light Exposure Duration

**Purpose:** Light exposure shows diminishing returns after 30-60 minutes, but the relationship is dose-dependent. Users with limited time still benefit from 30-minute sessions; those with flexibility may prefer longer sessions for maximum phase shift.

**Schema field:** `lightExposureMinutes` (new field)

```prisma
lightExposureMinutes Int @default(60)
```

**Options:**

| Value | Label    | Description                        |
| ----- | -------- | ---------------------------------- |
| 30    | "30 min" | Shorter sessions — still effective |
| 45    | "45 min" | Moderate                           |
| 60    | "60 min" | Standard — recommended duration    |
| 90    | "90 min" | Extended — maximize phase shift    |

**Default:** 60 minutes

**UI:**

- Setting label: "Light exposure per session"
- Helper note: "How long each bright light session should be. Your schedule may include multiple sessions per day."
- Component: Radio buttons or segmented control

**Backend integration:**

- Currently hardcoded in `intervention_planner.py`:
  - Line 431: 60 min (optimal duration)
  - Line 338: 30 min (short phase)
  - Line 376: 30 min (short phase)
- Pass `light_exposure_minutes` from user preferences to schedule generation
- Short phase durations should remain at 30 min minimum regardless of preference (these are constrained scenarios)

---

## Implementation Checklist

### Schema & Database

- [ ] Add `lightExposureMinutes Int @default(60)` to User model
- [ ] Update `caffeineCutoffHours` default from 6 to 8
- [ ] Run migration

### TypeScript Types

- [ ] Add `caffeineCutoffHours` to `UserPreferences` type
- [ ] Add `lightExposureMinutes` to `UserPreferences` type
- [ ] Add to `TripFormState` if needed for per-trip override

### API

- [ ] Add both fields to preferences GET endpoint response
- [ ] Add both fields to preferences PATCH endpoint validation
- [ ] Pass values to Python schedule generation

### Python Backend

- [ ] Accept `caffeine_cutoff_hours` parameter in schedule generation
- [ ] Accept `light_exposure_minutes` parameter in schedule generation
- [ ] Update `intervention_planner.py` to use passed values instead of hardcoded

### UI

- [ ] Add caffeine cutoff control to preferences page
- [ ] Add light exposure control to preferences page
- [ ] Style consistently with existing preference controls

---

## Preferences We Chose Not to Implement

### Nap Duration Settings

**Fields considered:** `maxNapMinutes` (default 30), `maxNapWithDebtMinutes` (default 90)

**Decision:** Not implementing. The 30-min standard / 90-min high-debt split is scientifically grounded around sleep inertia avoidance and full sleep cycle completion. While individual variation exists in inertia susceptibility, users cannot accurately self-assess this the way they can caffeine sensitivity. The algorithm handles this well without user input.

### Arrival Nap Cutoff

**Field considered:** `arrivalNapCutoffTime` (default "13:00")

**Decision:** Not implementing. The 13:00 default is reasonable guidance based on the principle of not napping late enough to impair nighttime sleep. Making this configurable adds UI complexity without meaningful benefit — the underlying principle applies universally.

### Melatonin Dose

**Field considered:** `melatoninDoseMg` (default 0.5)

**Decision:** Not implementing. The Burgess 2010 research is clear that 0.3-0.5mg is optimal for chronobiotic (phase-shifting) effects; higher doses add drowsiness without additional benefit. Allowing users to select higher doses (up to 3mg) would reinforce the misconception that more = better. We keep the 0.5mg dose fixed and can explain the science in the UI if users ask.

### Default Sleep Debt

**Field considered:** `defaultSleepDebtHours` (default 4.0)

**Decision:** Not implementing. Users cannot accurately estimate their sleep debt, and the algorithm's assumption (4 hours post-red-eye) is reasonable. Getting this slightly wrong doesn't break the schedule, and exposing it adds confusion without benefit.

---

_Last updated: January 2025_
