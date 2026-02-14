# Dawnward: Frontend Design

> Screen structure, components, and user flows for Dawnward.

---

## Mockup Reference Files

| File                                   | Purpose                                                    |
| -------------------------------------- | ---------------------------------------------------------- |
| `design_docs/ui-v2.html`               | Full app mockup (multiple screens, minified/bundled)       |
| `design_docs/ui-v2-homepage-only.html` | Homepage only (readable source, use for styling reference) |

Use `ui-v2-homepage-only.html` when you need to inspect exact CSS values, Tailwind classes, or HTML structure.

---

## Screens Overview

| Screen          | Route        | Purpose                           |
| --------------- | ------------ | --------------------------------- |
| New Trip        | `/`          | Landing page with trip input form |
| Trip History    | `/trips`     | List of past and upcoming trips   |
| Settings        | `/settings`  | User preferences and account      |
| Schedule Detail | `/trip/[id]` | Daily intervention schedule       |
| Shared Schedule | `/s/[code]`  | Public shared trip view           |
| Science         | `/science`   | Circadian science explainer       |

---

## Screen Details

### 1. New Trip (Landing Page)

**URL:** `/`

**Layout:** Two-column on desktop, stacked on mobile

- Left: Trip input form
- Right: Trip preview card + Calendar sync card

**Components:**

- **Header** — Logo, nav (New Trip, History, Settings), Sign in button
- **Hero section** — Badge ("Science-backed jet lag optimization"), headline, subtitle
- **Plan Your Trip form:**
  - Airport selects (Departing from, Arriving at) with code + city display
  - Datetime pickers (Departure, Arrival)
  - "+ Add Connection" button for multi-leg trips
- **Your Preferences section:**
  - Toggle: Use melatonin (default on)
  - Toggle: Strategic caffeine (default on)
  - Toggle: Include exercise (default off)
  - Time inputs: Usual wake time, Usual sleep time
- **CTA:** "Generate My Schedule" (primary button, full width on mobile)
- **Trip Preview card** (sidebar on desktop):
  - Route display (SFO → SIN)
  - Time shift badge (+16h)
  - Stats row: Days before | Flight time | Day after
- **Calendar Sync card** (sidebar):
  - Icon, heading, description
  - "Connect Calendar" button

**Footer:** "Built with circadian science. Not medical advice." (links to `/science`)

---

### Homepage Styling Reference

_Source: `ui-v2-homepage-only.html`_

**Typography:**

- Font family: `system-ui, -apple-system, sans-serif` (set on body via inline style)
- Body text: `text-slate-800 antialiased`
- Logo: `font-semibold text-lg tracking-tight`
- Page title (h1): `text-3xl sm:text-4xl font-bold tracking-tight`
- Card titles: `text-xl font-semibold`
- Labels: `text-sm font-medium`

**Page Background Gradient:**

```css
background: linear-gradient(
  180deg,
  hsl(199 80% 95%) 0%,
  /* light blue */ hsl(199 70% 92%) 15%,
  hsl(38 60% 96%) 35%,
  /* cream */ hsl(16 70% 94%) 55%,
  /* peach */ hsl(280 50% 92%) 75%,
  /* lavender */ hsl(265 45% 88%) 100% /* purple */
);
```

**Component Background Opacities:**
| Component | Tailwind Classes |
|-----------|------------------|
| Header | `bg-white/70 backdrop-blur-sm` |
| Main cards | `bg-white/90 backdrop-blur-sm rounded-xl shadow-sm border border-slate-200/50` |
| Calendar sync card | `bg-white/50 border-2 border-dashed border-slate-200` |
| "How it works" card | `bg-white/60 border border-purple-100` |
| Footer | `bg-white/30 backdrop-blur-sm` |

**Hero Badge:**

- Classes: `bg-white/80 text-orange-600 text-sm font-medium shadow-sm`
- Sparkles icon before text

**"How it works" Card:**

- Title: `text-purple-700 font-medium text-sm`
- Description: `text-xs text-slate-500 leading-relaxed`

**Preference Toggle Backgrounds:**
| Preference | Background | Icon Color |
|------------|------------|------------|
| Melatonin | `bg-emerald-50/80` | `text-emerald-600` |
| Caffeine | `bg-orange-50/80` | `text-orange-600` |
| Exercise | `bg-sky-50/80` | `text-sky-600` |

**Trip Preview Stats Colors:**
| Stat | Color |
|------|-------|
| Days before | `text-sky-600` |
| Flight time | `text-orange-600` |
| Day after | `text-purple-600` |

---

### 2. Trip History

**URL:** `/history`

**Layout:** Single column, card list

**Components:**

- **Header** — Same as landing, "History" nav item highlighted
- **Page title:** "Trip History" with subtitle
- **Trip cards** (one per trip):
  - Route (SFO → NRT)
  - Time shift badge (+17h / -17h)
  - Status badge:
    - `Completed` — gray
    - `Active` — green, card has green border highlight
    - `Planned` — gray
  - Date
  - Route description (San Francisco → Tokyo)
  - Star rating (completed trips only, 1-5 stars)
  - Chevron arrow (clickable trips)

**Empty state:** "No trips yet — Your completed schedules will appear here"

---

### 3. Settings

**URL:** `/settings`

**Layout:** Single column, card sections

**Components:**

- **Header** — "Settings" nav item highlighted
- **Page title:** "Settings" with subtitle "Your default preferences for new trips"

**Sleep Schedule card:**

- Usual wake time (time input)
- Usual bedtime (time input)

**Intervention Preferences card:**

- Toggle: Include melatonin — "Low-dose timed supplements (0.5mg)"
- Toggle: Include caffeine timing — "Strategic coffee windows and cutoffs"

**Display Settings card:**

- Toggle: Use 24-hour time — "Display times as 14:00 instead of 2:00 PM"

**Account card:**

- Signed out: "Sign in to save your preferences and sync trips" + Google sign-in button
- Signed in: User email, "Sign out" link

---

### 4. Schedule Detail

**URL:** `/trip/[id]`

**Layout:** Single column with sticky footer

**Components:**

- **Back button** — Returns to History
- **Save prompt** (anonymous users): "Save this schedule?" with Google sign-in button
- **Trip header card:**
  - Route (SFO → SIN)
  - Time shift badge (+16h shift)
  - Dates (Jan 28-29, 2026)
  - Flight duration (17h flight)
- **Day tabs:** Horizontal scrollable
  - Day -2, Day -1, Flight, Arrival (etc.)
  - Active tab has filled background
  - Each tab shows date below label
- **Progress bar:**
  - "Today's progress" label
  - Fraction display (0 / 7)
  - Green fill proportional to completion

**Intervention cards** (one per intervention):

- Circular checkbox (left)
- Icon in colored circle (matches intervention type)
- Title (e.g., "Seek bright light early")
- Description (e.g., "Get outside or use a light box")
- Time badge (right, e.g., "6:00 AM")
- Completed state: checkbox checked, text strikethrough, reduced opacity

**Nested wake target cards:**

When multiple interventions occur at the same time as a `wake_target`, they display as nested children under the wake target card. This creates a clear "wake up and do these things" visual hierarchy.

- Parent card: full styling with time badge (e.g., "Target wake time" at 10:00 AM)
- Children cards: compact styling (smaller icon, no time badge)
- Connecting lines: amber-200 vertical + horizontal connectors
- Only `wake_target` triggers nesting; other same-time items remain separate

**Intervention types and icons:**
| Type | Icon | Color | Example title |
|------|------|-------|---------------|
| Light seek | Sun | Sunrise/amber | "Seek bright light early" |
| Light avoid | Glasses | Sky blue | "Avoid bright light" |
| Caffeine window | Coffee | Sunset/orange | "Earlier coffee window" |
| Caffeine cutoff | Coffee | Sunset/orange | "Last caffeine" |
| Melatonin | Pill | Sage/green | "Take melatonin (0.5mg)" |
| Sleep target | Moon | Night/purple | "Target sleep" |
| Meal timing | Utensils | Rose/pink | "Light early dinner" |

**Footer actions:**

- "Add to Calendar" (outline button)
- "Sign in to Save" (primary button) — or "Saved" when signed in

---

### Schedule View Modes

Viewport-driven behavior (no user preference toggle):

**Desktop:**

- All days start expanded showing full `DaySection` detail view
- Shows complete intervention cards with descriptions
- Progress bar visible for each day

**Mobile:**

- Uses `DaySummaryCard` component for each day
- Shows personalized one-line summaries per intervention (generated by Python scheduler, e.g., "Bright light for 60 min", "Target sleep — shifting earlier")
- Falls back to static condensed descriptions for older schedules without `summary` field
- Today's day auto-expands on load
- Users can expand/collapse individual days via "View details" / "Summarize" buttons
- Flight Day shows sub-sections: Before Boarding, On the Plane, After Landing

---

### Minimal Shift Tips

For small timezone shifts (≤2 hours), the schedule view shows a simplified `MinimalShiftTips` card instead of the full day-by-day schedule.

**Content:**

- Brief explanation that small shifts don't require intensive intervention
- General tips: maintain regular sleep, avoid caffeine 8 hours before bed, get morning light
- "View full schedule" button to see detailed timeline if desired

**Threshold:** Controlled by `MINIMAL_SHIFT_THRESHOLD_HOURS = 2` constant.

**Response fields:**

- `shift_magnitude` — Rounded absolute hours of timezone difference
- `is_minimal_shift` — Boolean flag when shift ≤ threshold

---

## User Flows

### Anonymous User Flow

1. Land on New Trip page
2. Fill in flight details and preferences
3. Click "Generate My Schedule"
4. View Schedule Detail with interventions
5. Prompted to sign in to save
6. If sign in: Trip saved to database, added to History

### Signed-In User Flow

1. Land on New Trip page (or click "+ New Trip")
2. Fill in flight details (preferences pre-filled from Settings)
3. Click "Generate My Schedule"
4. View Schedule Detail
5. Trip automatically saved to History
6. Option to "Add to Calendar"

### Returning User Flow

1. Navigate to History
2. Click on Active or Planned trip
3. View Schedule Detail for that day
4. Check off completed interventions
5. Progress bar updates

---

## Responsive Behavior

### Breakpoints

- **Mobile:** < 768px — single column, stacked layout
- **Desktop:** >= 768px — multi-column where applicable

### Mobile Adaptations

**Header:**

- Logo visible
- Nav items show as icons only (clock for History, gear for Settings)
- "Sign in" text visible

**New Trip page:**

- Form takes full width
- Trip preview card and Calendar sync card stack below form
- Airport selects stack (Departing from above Arriving at)
- Date inputs stack (Departure above Arrival)
- CTA button full width

**History page:**

- Trip cards full width
- All card content fits in single column layout

**Schedule Detail:**

- Day tabs horizontally scrollable
- Intervention cards full width
- Footer buttons stack or side-by-side depending on width

---

## State Management Notes

### Form State

- Airport selection: typeahead search, stores code + name
- Datetime: native datetime-local or custom picker
- Toggles: boolean state
- Time inputs: stored as HH:MM

### Schedule State

- Active day tab (index or date)
- Completion checkboxes (intervention ID → boolean)
- Progress derived from completion count

### Auth State

- Anonymous: can generate 1 schedule, stored in localStorage
- Signed in: schedules stored in database, preferences synced

---

## Component Reusability

These components appear across multiple screens:

| Component         | Used in                          |
| ----------------- | -------------------------------- |
| Header            | All screens                      |
| Footer            | All screens                      |
| Trip card         | Trip History, New Trip (preview) |
| Toggle row        | Settings, New Trip               |
| Time input        | Settings, New Trip               |
| Primary button    | All screens                      |
| Badge             | Trip cards, Schedule header      |
| Progress bar      | Schedule Detail                  |
| Intervention card | Schedule Detail (timeline mode)  |
| DaySummaryCard    | Schedule Detail (summary mode)   |
| DaySection        | Schedule Detail (timeline mode)  |
| MinimalShiftTips  | Schedule Detail (small shifts)   |
| InflightSleepCard | Schedule Detail (in-transit)     |
| ScheduleHeader    | Schedule Detail                  |

---

_Reference: `design_docs/ui-v2.html` for full app mockup, `design_docs/ui-v2-homepage-only.html` for readable homepage source, `design_docs/brand.md` for brand guidelines._
