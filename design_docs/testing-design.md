# Dawnward Testing Design Document

## Executive Summary

This document defines the validation strategy for Dawnward's circadian phase-shift recommendations against the underlying Forger99 model and published scientific literature. Our goal is to ensure Dawnward's output is physiologically plausible, consistent with the Arcascope library's model implementation, and aligned with peer-reviewed research on jet lag adaptation.

---

## Background: The Scientific Foundation

Dawnward uses the Arcascope `circadian` library, which implements the Forger99 model—a limit cycle oscillator that simulates the human circadian pacemaker's response to light. Our testing must validate that:

1. Our wrapper correctly invokes the model
2. The resulting recommendations fall within published physiological limits
3. The schedule logic (light-seeking, light-avoidance, melatonin timing) aligns with established phase response curves

### Core Reference Papers

The following papers form the scientific basis for our validation criteria:

**Mathematical Model (What We're Testing Against)**

| Paper | Key Contribution |
|-------|------------------|
| Forger et al. (1999), "A simpler model of the human circadian pacemaker," *J Biol Rhythms* | Defines the Forger99 model equations we use via Arcascope |
| Kronauer et al. (1999), "Quantifying human circadian pacemaker response to brief, extended, and repeated light stimuli," *J Biol Rhythms* | Establishes light input parameters and response characteristics |
| Jewett et al. (1999), "Revised limit cycle oscillator model," *J Biol Rhythms* | Provides baseline oscillator dynamics |

**Phase Response Curves (Validation Benchmarks)**

| Paper | Key Contribution |
|-------|------------------|
| Khalsa et al. (2003), "A phase response curve to single bright light pulses," *J Physiol* | Gold-standard human PRC for bright light; ~3 hour maximum phase shift |
| Revell et al. (2012), "Human phase response curve to intermittent blue light," *J Physiol* | Validates response to shorter-wavelength light |
| Burgess et al. (2010), "Human phase response curves to three days of melatonin: 0.5 mg vs 3.0 mg," *JCEM* | Melatonin PRC; timing relative to DLMO |

**Real-World Jet Lag Applications (Expected Outcomes)**

| Paper | Key Contribution |
|-------|------------------|
| Dean et al. (2009), "Taking the Lag out of Jet Lag through Model-Based Schedule Design," *PLOS Comp Biol* | Demonstrates model-based schedule optimization; provides validation scenarios |
| Serkh & Forger (2020), "Optimal adjustment of the human circadian clock in the real world," *PLOS Comp Biol* | Updates optimal control approach; real-world constraints |
| Eastman & Burgess (2009), "How to Travel the World Without Jet Lag," *Sleep Med Clin* | Practical guidelines we can use as sanity checks |

---

## Testing Strategy Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TESTING LAYERS                                │
├─────────────────────────────────────────────────────────────────────┤
│  Layer 1: Model Parity Tests                                        │
│  → Does Dawnward's output match raw Arcascope/Forger99?             │
├─────────────────────────────────────────────────────────────────────┤
│  Layer 2: Physiological Bounds Tests                                │
│  → Are outputs within published human limits?                       │
├─────────────────────────────────────────────────────────────────────┤
│  Layer 3: PRC Consistency Tests                                     │
│  → Do recommendations align with published phase response curves?   │
├─────────────────────────────────────────────────────────────────────┤
│  Layer 4: Scenario Regression Tests                                 │
│  → Do canonical trips produce expected schedules?                   │
├─────────────────────────────────────────────────────────────────────┤
│  Layer 5: Edge Case Tests                                           │
│  → Do extreme scenarios fail gracefully?                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Model Parity Tests

**Objective:** Verify Dawnward's phase trajectory matches the underlying Arcascope library when given identical inputs.

### Test Methodology

For each test case, we run the same light schedule through both:
1. Dawnward's recommendation engine
2. Direct Arcascope `circadian` library calls

We then compare the resulting CBT_min (core body temperature minimum) trajectory.

### Acceptance Criteria

| Metric | Threshold | Rationale |
|--------|-----------|-----------|
| Phase difference at each hour | ≤ 5 minutes | Accounts for numerical precision |
| Final phase difference | ≤ 10 minutes | Allows minor rounding in schedule presentation |
| Trajectory correlation (r²) | ≥ 0.999 | Ensures shape matches |

### Test Cases

**1.1 - Identity Test (No Intervention)**  
Input: Baseline sleep schedule, no travel, no light manipulation  
Expected: CBT_min remains at initial phase (±15 min drift over 7 days)

**1.2 - Eastward 6-Hour Shift**  
Input: JFK → Paris (6h advance), standard Dawnward recommendations  
Compare: Dawnward trajectory vs. raw Arcascope with identical light input

**1.3 - Westward 8-Hour Shift**  
Input: NYC → Tokyo via west (8h delay)  
Compare: Ensure phase delay direction and magnitude match

**1.4 - Pre-Flight Adaptation**  
Input: 3-day pre-departure shifting (per Burgess & Eastman protocol)  
Expected: ~2 hours of phase advance over 3 days with morning bright light (Burgess et al., 2010 found 1.9h median advance with 2h/day bright light exposure)

### Implementation

```python
# Pseudo-code for parity test
def test_model_parity(trip_params):
    dawnward_trajectory = dawnward.generate_schedule(trip_params).phase_trajectory
    arcascope_trajectory = circadian.simulate(trip_params.to_light_schedule())
    
    for hour in range(len(dawnward_trajectory)):
        phase_diff = abs(dawnward_trajectory[hour] - arcascope_trajectory[hour])
        assert phase_diff.total_seconds() / 60 <= 5, f"Hour {hour}: {phase_diff} exceeds 5 min"
```

---

## Layer 2: Physiological Bounds Tests

**Objective:** Ensure all recommendations fall within known human physiological limits.

### Bounds Derived from Literature

| Parameter | Lower Bound | Upper Bound | Source |
|-----------|-------------|-------------|--------|
| Maximum daily phase advance | — | 1.5 hours | Khalsa et al. (2003): PRC shows ~3h max shift with optimal timing; Eastman notes 57 min/day from field data |
| Maximum daily phase delay | — | 2.0 hours | Khalsa et al. (2003): delays proceed faster; Eastman notes 92 min/day from field data |
| Melatonin dose | 0.5 mg | 5.0 mg | Burgess et al. (2010): 0.5mg effective; higher doses not more effective |
| Light avoidance window | 2h before CBT_min | 2h after CBT_min | Dean et al. (2009): critical window for avoiding antidromic shifts |
| Minimum sleep duration | 6 hours | — | Serkh & Forger (2020): constraint in optimal control |

### Test Cases

**2.1 - Maximum Phase Shift Rate**  
For any generated schedule, compute daily phase shift. Assert:
- Advances ≤ 1.5 h/day (with intervention)
- Delays ≤ 2.0 h/day (with intervention)

**2.2 - No Antidromic Risk**  
Verify light exposure recommendations never occur during the "wrong" half of the PRC that would cause opposite-direction shifts.

Per Khalsa et al. (2003):
- Light before CBT_min → phase delays
- Light after CBT_min → phase advances

Dawnward must never recommend seeking light when delay is needed during the advance portion of the PRC (and vice versa).

**2.3 - Sleep Duration Constraints**  
No schedule should require less than 6 hours of sleep opportunity per 24-hour period.

**2.4 - Melatonin Timing Validation**  
Per Burgess et al. (2010):
- For phase advances: melatonin ~5 hours before DLMO (afternoon/early evening)
- For phase delays: melatonin upon waking (morning)

Verify Dawnward's melatonin recommendations fall within ±1 hour of these windows.

---

## Layer 3: Phase Response Curve Consistency Tests

**Objective:** Validate that Dawnward's light and melatonin recommendations are appropriately timed relative to the user's current circadian phase.

### Light PRC Validation (Khalsa et al., 2003)

The human light PRC has a characteristic shape:
- Maximum delays: ~2.5 hours before CBT_min
- Crossover (no shift): at CBT_min
- Maximum advances: ~2.5 hours after CBT_min
- Dead zone: ~6-12 hours opposite CBT_min

### Test Cases

**3.1 - Light Recommendation Timing Audit**  
For a sample of generated schedules:
1. Extract all "seek bright light" recommendations
2. Calculate timing relative to predicted CBT_min
3. Verify alignment with desired shift direction

| Desired Shift | Expected Light Timing | Tolerance |
|---------------|----------------------|-----------|
| Advance | 0 to +4h after CBT_min | ±1 hour |
| Delay | -4 to 0h before CBT_min | ±1 hour |

**3.2 - Light Avoidance Timing Audit**  
For "avoid light" recommendations:
1. Verify avoidance windows cover the PRC region that would cause undesired shifts
2. Particularly critical: avoiding light during the crossover point and wrong-direction region

**3.3 - Melatonin PRC Validation (Burgess et al., 2010)**  
Melatonin PRC is approximately opposite to light:
- Advances: afternoon melatonin (before DLMO)
- Delays: morning melatonin (after CBT_min)

Verify melatonin timing aligns with this.

---

## Layer 4: Scenario Regression Tests

**Objective:** Establish canonical test trips with expected outputs based on published examples.

### Regression Suite

**4.1 - Eastman & Burgess "World Tour" Scenarios**  
From "How to Travel the World Without Jet Lag" (2009):

| Route | Zones | Direction | Expected Adaptation |
|-------|-------|-----------|---------------------|
| Chicago → London | 6 | East (Advance) | ~4-5 days post-arrival |
| Chicago → Tokyo | 14→ treat as 10W | West (Delay) | ~5-6 days post-arrival |
| NYC → Sydney | 15→ treat as 9W | West (Delay) | ~4-5 days post-arrival |

**4.2 - Dean et al. (2009) Optimal Schedules**  
The PLOS Comp Biol paper provides specific optimized schedules:

| Scenario | Pre-flight days | Post-flight days | Total adaptation |
|----------|-----------------|------------------|------------------|
| 9h eastward | 3 | 1 | Full entrainment |
| 12h shift | 4 | 2 | Full entrainment |

Compare Dawnward output to these benchmarks.

**4.3 - Serkh & Forger (2020) Real-World Constraints**  
This paper introduces realistic constraints (can't always get bright light, can't always avoid light). Verify Dawnward handles:
- Cloudy/indoor days (reduced lux)
- Social obligations during recommended sleep
- Partial compliance scenarios

### Regression Test Format

```yaml
test_4_1_chicago_london:
  origin: ORD
  destination: LHR
  departure_local: "2026-03-15T18:00"
  arrival_local: "2026-03-16T08:00"
  chronotype: intermediate
  expected:
    shift_direction: advance
    total_shift_hours: 6
    adaptation_days_post_arrival: 4-6
    first_light_recommendation_relative_to_cbt_min: "+2h to +4h"
    melatonin_timing: "afternoon before departure"
```

---

## Layer 5: Edge Case Tests

**Objective:** Verify graceful handling of unusual scenarios.

### Test Cases

**5.1 - Circadian Equator Crossing (12-hour shift)**  
Input: NYC → Auckland (12h difference)  
Expected: Algorithm should choose optimal direction (typically delay for westward-equivalent)  
Per Eastman: "For 9-12 hour shifts, direction matters less but avoiding antidromic shift is critical"

**5.2 - Very Short Trip (< 48 hours)**  
Input: NYC → London, 36-hour trip  
Expected: Recommendation to maintain home timezone rather than shift  
Rationale: Insufficient time for meaningful adaptation; shifting would cause double-adjustment

**5.3 - Extreme Chronotypes**  
Test with CBT_min at unusual times:
- Extreme owl: CBT_min at 8 AM
- Extreme lark: CBT_min at 3 AM

Verify PRC-relative recommendations still make sense.

**5.4 - Multi-Leg Trips**  
Input: NYC → London (2 days) → Dubai (3 days) → NYC  
Expected: Either maintain NYC time throughout, or provide staged adaptation with warnings about insufficient time.

**5.5 - Zero Timezone Change**  
Input: NYC → Santiago (same timezone, different hemisphere)  
Expected: No circadian intervention needed (though seasonal light differences may be noted)

---

## Spot-Check Protocol

For ongoing validation beyond automated tests, use this manual spot-check protocol:

### Weekly Spot-Check Procedure

1. **Generate 5 random trips** using production Dawnward
2. **For each trip, extract:**
   - Light recommendation times (in local and relative-to-CBT_min)
   - Melatonin recommendation times
   - Predicted phase trajectory
3. **Run same parameters through raw Arcascope:**
   ```python
   from circadian import Oscillator
   osc = Oscillator.forger99()
   # ... simulate with same light input
   ```
4. **Compare trajectories** using Layer 1 criteria
5. **Manual PRC check:** Plot recommendations on Khalsa PRC template, verify alignment
6. **Document any discrepancies** in testing log

### Quarterly Deep Validation

1. Recruit 2-3 internal testers for actual trips
2. Have them follow Dawnward recommendations
3. Collect subjective jet lag ratings (1-10 scale) at +1, +3, +5 days
4. Compare to expected adaptation timeline from literature

---

## Success Criteria Summary

| Layer | Metric | Pass Threshold |
|-------|--------|----------------|
| 1 - Model Parity | Phase difference vs Arcascope | ≤ 10 min final |
| 2 - Physiological Bounds | Daily shift rate | ≤ 1.5h (advance) / 2.0h (delay) |
| 3 - PRC Consistency | Light timing vs CBT_min | Within ±1h of optimal |
| 4 - Scenario Regression | Adaptation timeline | Within 1 day of literature |
| 5 - Edge Cases | Graceful handling | No crashes, sensible fallbacks |

---

## Appendix A: Key Phase Response Curve Reference

From Khalsa et al. (2003), the human light PRC (10,000 lux):

```
Phase Shift (hours)
     │
  +3 │           ╭──╮
     │          ╱    ╲         ← Maximum advance zone
  +2 │         ╱      ╲
     │        ╱        ╲
  +1 │       ╱          ╲
     │      ╱            ╲
   0 │─────╱──────────────╲──────────── CBT_min
     │    ╱                ╲
  -1 │   ╱                  ╲
     │  ╱                    ╲
  -2 │ ╱                      ╲    ← Maximum delay zone
     │╱                        ╲
  -3 │                          ╲
     └────────────────────────────────
      -12  -8  -4  CBT  +4  +8  +12
           Hours relative to CBT_min
```

**Key timing windows:**
- **Delay zone:** Light 4-0 hours before CBT_min
- **Advance zone:** Light 0-4 hours after CBT_min  
- **Dead zone:** Light 6-12 hours from CBT_min (minimal effect)
- **Danger zone:** Light at crossover risks antidromic shift

---

## Appendix B: Test Data Generator

```python
"""Generate randomized test trips for spot-checking."""
import random
from datetime import datetime, timedelta

AIRPORTS = {
    'JFK': {'tz': -5, 'city': 'New York'},
    'LAX': {'tz': -8, 'city': 'Los Angeles'},
    'LHR': {'tz': 0, 'city': 'London'},
    'CDG': {'tz': 1, 'city': 'Paris'},
    'NRT': {'tz': 9, 'city': 'Tokyo'},
    'SYD': {'tz': 11, 'city': 'Sydney'},
    'DXB': {'tz': 4, 'city': 'Dubai'},
}

def generate_test_trip():
    origin, dest = random.sample(list(AIRPORTS.keys()), 2)
    tz_diff = AIRPORTS[dest]['tz'] - AIRPORTS[origin]['tz']
    
    return {
        'origin': origin,
        'destination': dest,
        'timezone_shift': tz_diff,
        'direction': 'advance' if tz_diff > 0 else 'delay',
        'chronotype': random.choice(['early', 'intermediate', 'late']),
        'pre_flight_days': random.choice([1, 2, 3]),
    }

# Generate 5 random test cases
for i in range(5):
    print(f"Test {i+1}: {generate_test_trip()}")
```

---

## Appendix C: Literature Quick Reference

**For phase shift magnitude validation:**
> "The largest phase shifts that we have found in our studies are about 12 hours in 1 week (92 min/day) for delaying the circadian system and about 8 hours in 1 week (69 min/day) for advancing the circadian system."  
> — Eastman & Burgess (2009)

**For melatonin timing:**
> "Melatonin taken in the afternoon/early evening shifts circadian rhythms earlier (phase advance), while melatonin taken in the morning shifts rhythms later (phase delay)."  
> — Burgess et al. (2010)

**For pre-flight adaptation:**
> "A 2-h phase advance may seem small compared to a 6- to 9-h time zone change... However, a small phase advance will not only reduce the degree of re-entrainment required after arrival, but may also increase postflight exposure to phase-advancing light."  
> — Burgess & Eastman, pre-flight adaptation study

**For optimal control approach:**
> "We have developed schedules that could take an individual from any initial phase to any final phase using an optimization technique called optimal control theory."  
> — Dean et al. (2009)
