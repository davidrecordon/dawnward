import { google, calendar_v3 } from "googleapis";
import type {
  DaySchedule,
  Intervention,
  InterventionType,
} from "@/types/schedule";
import { getDisplayTime } from "@/types/schedule";

// =============================================================================
// Event Density Configuration
// =============================================================================

/** Interventions that should never be grouped - they stand alone regardless of timing */
const STANDALONE_TYPES: Set<InterventionType> = new Set([
  "caffeine_cutoff", // Mid-day "last chance" reminder - critical timing
  "exercise", // Specific circadian timing, often mid-day
  "nap_window", // In-flight only, has flight_offset_hours
  "light_avoid", // PRC-calculated duration (2-4h), needs its own event
]);

/**
 * Event durations by type (minutes), or "from_intervention" to use duration_min.
 * Standalone events still use these durations.
 * Minimum duration is 15 minutes for practical calendar visibility.
 */
const EVENT_DURATION: Record<InterventionType, number | "from_intervention"> = {
  wake_target: 15, // Point-in-time reminder
  sleep_target: 15, // Point-in-time reminder
  melatonin: 15, // Point-in-time reminder (take pill)
  caffeine_cutoff: 15, // Reminder
  exercise: 45, // Typical workout
  light_seek: "from_intervention", // User's preference (30/45/60/90)
  light_avoid: "from_intervention", // PRC-calculated avoidance window (2-4h)
  nap_window: "from_intervention", // Calculated nap window
  caffeine_ok: 0, // Not actionable - shouldn't create event
};

/** Types that block time (show as busy) */
const SHOW_AS_BUSY: Set<InterventionType> = new Set(["nap_window", "exercise"]);

/** Grouping window in minutes (interventions within this of anchor get grouped) */
const GROUPING_WINDOW_MIN = 120;

/** Default event duration in minutes when not specified */
const DEFAULT_EVENT_DURATION_MIN = 15;

/**
 * Format a Date as RFC3339 datetime string (without timezone offset).
 * Used for Google Calendar API.
 */
function formatDateTime(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

/** Reminder time in minutes by intervention type */
const REMINDER_MINUTES: Partial<Record<InterventionType, number>> = {
  wake_target: 0, // Immediate - alarm is the event itself
  sleep_target: 30, // 30 min to wind down
  exercise: 15, // Brief heads-up
  caffeine_cutoff: 15, // Brief heads-up
};

const DEFAULT_REMINDER_MINUTES = 15;

/**
 * Get reminder time in minutes based on intervention type.
 * Different interventions warrant different lead times.
 */
export function getReminderMinutes(type: InterventionType): number {
  return REMINDER_MINUTES[type] ?? DEFAULT_REMINDER_MINUTES;
}

/**
 * Check if an intervention type is actionable (should create calendar event).
 * Advisory-only types like caffeine_ok don't need their own events.
 */
export function isActionableIntervention(type: InterventionType): boolean {
  // caffeine_ok is just informational - no action required
  return type !== "caffeine_ok";
}

/** Emoji lookup for intervention types */
const INTERVENTION_EMOJI: Record<InterventionType, string> = {
  wake_target: "⏰",
  sleep_target: "😴",
  melatonin: "💊",
  light_seek: "🌅",
  light_avoid: "🕶️",
  caffeine_ok: "☕",
  caffeine_cutoff: "🚫",
  exercise: "🏃",
  nap_window: "💤",
};

const DEFAULT_EMOJI = "📋";

/**
 * Get emoji for intervention type
 */
function getEmoji(type: InterventionType): string {
  return INTERVENTION_EMOJI[type] ?? DEFAULT_EMOJI;
}

/** Short label lookup for grouped event titles */
const SHORT_LABELS: Partial<Record<InterventionType, string>> = {
  light_seek: "Light",
  light_avoid: "Avoid light",
  caffeine_ok: "Caffeine",
  caffeine_cutoff: "No caffeine",
  melatonin: "Melatonin",
  exercise: "Exercise",
  nap_window: "Nap",
};

/**
 * Get short label for grouped event titles
 */
function getShortLabel(type: InterventionType): string {
  return SHORT_LABELS[type] ?? "";
}

/**
 * Determine the anchor type for a group of interventions.
 * Wake/sleep targets take priority, then melatonin, then others.
 */
function getAnchorIntervention(interventions: Intervention[]): Intervention {
  // Priority: wake_target > sleep_target > melatonin > first item
  const priority: InterventionType[] = [
    "wake_target",
    "sleep_target",
    "melatonin",
  ];

  for (const type of priority) {
    const found = interventions.find((i) => i.type === type);
    if (found) return found;
  }

  return interventions[0];
}

/**
 * Build a calendar event title from grouped interventions.
 * Examples:
 * - "⏰ Wake up: Light + Caffeine"
 * - "😴 Bedtime: Melatonin"
 * - "💊 Take melatonin"
 */
export function buildEventTitle(interventions: Intervention[]): string {
  if (interventions.length === 0) return "";

  const anchor = getAnchorIntervention(interventions);
  const emoji = getEmoji(anchor.type);

  // Single intervention - use full title
  if (interventions.length === 1) {
    return `${emoji} ${anchor.title}`;
  }

  // Multiple interventions - anchor title + short labels
  const others = interventions.filter((i) => i !== anchor);
  const otherLabels = others
    .map((i) => getShortLabel(i.type))
    .filter((label) => label !== "")
    .join(" + ");

  if (otherLabels) {
    // Shorten anchor title for grouped display
    let anchorLabel: string;
    if (anchor.type === "wake_target") {
      anchorLabel = "Wake up";
    } else if (anchor.type === "sleep_target") {
      anchorLabel = "Bedtime";
    } else {
      anchorLabel = anchor.title;
    }
    return `${emoji} ${anchorLabel}: ${otherLabels}`;
  }

  return `${emoji} ${anchor.title}`;
}

/**
 * Build event description from grouped interventions
 */
export function buildEventDescription(interventions: Intervention[]): string {
  return interventions.map((i) => `• ${i.description}`).join("\n");
}

/**
 * Group interventions by their time for smart calendar event creation.
 * Returns a map of time -> interventions at that time.
 */
export function groupInterventionsByTime(
  interventions: Intervention[]
): Map<string, Intervention[]> {
  const groups = new Map<string, Intervention[]>();

  for (const intervention of interventions) {
    // Skip non-actionable interventions
    if (!isActionableIntervention(intervention.type)) {
      continue;
    }

    const time = getDisplayTime(intervention);
    if (!groups.has(time)) {
      groups.set(time, []);
    }
    groups.get(time)!.push(intervention);
  }

  return groups;
}

// =============================================================================
// Anchor-Based Grouping (Event Density Optimization)
// =============================================================================

/**
 * Parse HH:MM time to minutes since midnight.
 */
function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Get event duration for an intervention based on type configuration.
 */
export function getEventDuration(intervention: Intervention): number {
  const configured = EVENT_DURATION[intervention.type];
  if (configured === "from_intervention") {
    return intervention.duration_min ?? DEFAULT_EVENT_DURATION_MIN;
  }
  return configured || DEFAULT_EVENT_DURATION_MIN;
}

/**
 * Check if an intervention type should always be standalone (never grouped).
 */
export function isStandaloneType(type: InterventionType): boolean {
  return STANDALONE_TYPES.has(type);
}

/**
 * Check if an intervention should show as busy on the calendar.
 */
export function shouldShowAsBusy(type: InterventionType): boolean {
  return SHOW_AS_BUSY.has(type);
}

/**
 * Group interventions around wake/sleep anchors for reduced event count.
 *
 * Strategy:
 * 1. Identify wake_target and sleep_target as anchors
 * 2. Group nearby interventions (within GROUPING_WINDOW_MIN) with their anchor
 * 3. Keep standalone types (caffeine_cutoff, exercise, nap_window, light_avoid) separate
 *
 * Returns a map where each key is a unique identifier and value is the group.
 * Each group creates one calendar event.
 */
export function groupInterventionsByAnchor(
  interventions: Intervention[]
): Map<string, Intervention[]> {
  const groups = new Map<string, Intervention[]>();

  // Filter to actionable interventions only
  const actionable = interventions.filter((i) =>
    isActionableIntervention(i.type)
  );

  if (actionable.length === 0) {
    return groups;
  }

  // Find anchors (wake_target and sleep_target)
  const wakeAnchor = actionable.find((i) => i.type === "wake_target");
  const sleepAnchor = actionable.find((i) => i.type === "sleep_target");

  const wakeTime = wakeAnchor
    ? parseTimeToMinutes(getDisplayTime(wakeAnchor))
    : null;
  const sleepTime = sleepAnchor
    ? parseTimeToMinutes(getDisplayTime(sleepAnchor))
    : null;

  // Track which interventions have been grouped
  const grouped = new Set<Intervention>();

  // Initialize anchor groups if anchors exist
  if (wakeAnchor) {
    const key = `wake:${getDisplayTime(wakeAnchor)}`;
    groups.set(key, [wakeAnchor]);
    grouped.add(wakeAnchor);
  }

  if (sleepAnchor) {
    const key = `sleep:${getDisplayTime(sleepAnchor)}`;
    groups.set(key, [sleepAnchor]);
    grouped.add(sleepAnchor);
  }

  // Process remaining interventions
  for (const intervention of actionable) {
    if (grouped.has(intervention)) continue;

    const time = parseTimeToMinutes(getDisplayTime(intervention));

    // Standalone types are never grouped
    if (isStandaloneType(intervention.type)) {
      const key = `standalone:${intervention.type}:${getDisplayTime(intervention)}`;
      groups.set(key, [intervention]);
      grouped.add(intervention);
      continue;
    }

    // Try to find nearest anchor within window
    let nearestAnchorKey: string | null = null;
    let nearestDistance = Infinity;

    // Check distance to wake anchor
    if (wakeTime !== null) {
      const distance = Math.abs(time - wakeTime);
      if (distance <= GROUPING_WINDOW_MIN && distance < nearestDistance) {
        nearestDistance = distance;
        nearestAnchorKey = `wake:${getDisplayTime(wakeAnchor!)}`;
      }
    }

    // Check distance to sleep anchor
    if (sleepTime !== null) {
      const distance = Math.abs(time - sleepTime);
      if (distance <= GROUPING_WINDOW_MIN && distance < nearestDistance) {
        nearestDistance = distance;
        nearestAnchorKey = `sleep:${getDisplayTime(sleepAnchor!)}`;
      }
    }

    if (nearestAnchorKey) {
      // Add to existing anchor group
      groups.get(nearestAnchorKey)!.push(intervention);
      grouped.add(intervention);
    } else {
      // No anchor in range - create standalone event
      const key = `standalone:${intervention.type}:${getDisplayTime(intervention)}`;
      groups.set(key, [intervention]);
      grouped.add(intervention);
    }
  }

  return groups;
}

/**
 * Convert an intervention group to a Google Calendar event.
 * Extracts timezone AND date from the intervention based on phase:
 * - Pre-flight phases (preparation, pre_departure): use origin_tz + origin_date
 * - Other phases (in_transit, post_arrival, adaptation): use dest_tz + dest_date
 *
 * This is critical for cross-dateline flights where the origin and destination
 * dates differ significantly.
 */
export function buildCalendarEvent(
  interventions: Intervention[]
): calendar_v3.Schema$Event {
  if (interventions.length === 0) {
    throw new Error("Cannot build event from empty interventions");
  }

  const time = getDisplayTime(interventions[0]); // All interventions in group have same time
  const anchor = getAnchorIntervention(interventions);

  // Get timezone AND date based on phase - must be consistent
  // Pre-flight: use origin_tz + origin_date (user is at home)
  // Other phases: use dest_tz + dest_date (user is traveling to/at destination)
  const phase = anchor.phase_type;
  const isPreFlight = phase === "preparation" || phase === "pre_departure";
  const timezone = isPreFlight ? anchor.origin_tz : anchor.dest_tz;
  const date = isPreFlight ? anchor.origin_date : anchor.dest_date;

  if (!timezone) {
    throw new Error(
      `Intervention missing timezone context (phase: ${phase}, origin_tz: ${anchor.origin_tz}, dest_tz: ${anchor.dest_tz})`
    );
  }

  if (!date) {
    throw new Error(
      `Intervention missing date context (phase: ${phase}, origin_date: ${anchor.origin_date}, dest_date: ${anchor.dest_date})`
    );
  }

  // Calculate event duration - use the longest duration among all interventions
  // (e.g., if wake_target groups with light_seek, use light_seek's 60 min, not wake's 15 min)
  const durationMin = Math.max(...interventions.map(getEventDuration));

  // Create start/end DateTimes
  const startDate = new Date(`${date}T${time}:00`);
  const endDate = new Date(startDate.getTime() + durationMin * 60 * 1000);

  // Use anchor's reminder time
  const reminderMinutes = getReminderMinutes(anchor.type);

  // Determine if event should show as busy (opaque) or free (transparent)
  const transparency = shouldShowAsBusy(anchor.type) ? "opaque" : "transparent";

  return {
    summary: buildEventTitle(interventions),
    description: buildEventDescription(interventions),
    start: {
      dateTime: formatDateTime(startDate),
      timeZone: timezone,
    },
    end: {
      dateTime: formatDateTime(endDate),
      timeZone: timezone,
    },
    transparency,
    reminders: {
      useDefault: false,
      overrides: [{ method: "popup", minutes: reminderMinutes }],
    },
  };
}

/**
 * Create an authenticated Google Calendar API client
 */
export function getCalendarClient(accessToken: string): calendar_v3.Calendar {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
  });

  return google.calendar({ version: "v3", auth: oauth2Client });
}

/**
 * Create a calendar event
 */
export async function createCalendarEvent(
  accessToken: string,
  event: calendar_v3.Schema$Event
): Promise<string> {
  const calendar = getCalendarClient(accessToken);

  const response = await calendar.events.insert({
    calendarId: "primary",
    requestBody: event,
  });

  if (!response.data.id) {
    throw new Error("Failed to create calendar event");
  }

  return response.data.id;
}

/**
 * Delete a calendar event
 */
export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  const calendar = getCalendarClient(accessToken);

  try {
    await calendar.events.delete({
      calendarId: "primary",
      eventId,
    });
  } catch (error: unknown) {
    // Ignore 404 errors (event already deleted)
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 404
    ) {
      return;
    }
    throw error;
  }
}

/** Result of deleting multiple calendar events */
export interface DeleteEventsResult {
  /** Event IDs that were successfully deleted */
  deleted: string[];
  /** Event IDs that failed to delete (excluding 404s which are treated as success) */
  failed: string[];
}

/**
 * Delete multiple calendar events.
 * Uses Promise.allSettled to ensure all deletions are attempted even if some fail.
 * Returns which events were successfully deleted vs failed.
 */
export async function deleteCalendarEvents(
  accessToken: string,
  eventIds: string[]
): Promise<DeleteEventsResult> {
  const results = await Promise.allSettled(
    eventIds.map((id) => deleteCalendarEvent(accessToken, id).then(() => id))
  );

  const deleted: string[] = [];
  const failed: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      deleted.push(result.value);
    } else {
      failed.push(eventIds[i]);
    }
  }

  return { deleted, failed };
}

/** Result of creating calendar events for a schedule */
export interface CreateEventsResult {
  /** Event IDs that were successfully created */
  created: string[];
  /** Number of events that failed to create */
  failed: number;
}

/**
 * Create calendar events for all actionable interventions in a schedule.
 * Groups interventions around wake/sleep anchors for reduced event count.
 * Each event uses the timezone from the intervention itself based on phase.
 * Returns both successful and failed event counts.
 */
export async function createEventsForSchedule(
  accessToken: string,
  interventionDays: DaySchedule[]
): Promise<CreateEventsResult> {
  const created: string[] = [];
  let failed = 0;

  console.log(
    `[Calendar] Creating events for ${interventionDays.length} days`
  );

  for (const day of interventionDays) {
    // Use anchor-based grouping for reduced event density
    const groups = groupInterventionsByAnchor(day.items);

    console.log(
      `[Calendar] Day ${day.day} (${day.date}): ${groups.size} event groups from ${day.items.length} interventions`
    );

    for (const [key, interventions] of groups) {
      try {
        const event = buildCalendarEvent(interventions);
        console.log(
          `[Calendar] Creating event: "${event.summary}" at ${event.start?.dateTime} (${event.start?.timeZone})`
        );
        const eventId = await createCalendarEvent(accessToken, event);
        console.log(`[Calendar] Created event ID: ${eventId}`);
        created.push(eventId);
      } catch (error) {
        console.error(`[Calendar] Error creating event for group ${key}:`, error);
        failed++;
        // Continue with other events even if one fails
      }
    }
  }

  console.log(
    `[Calendar] Finished: ${created.length} created, ${failed} failed`
  );

  return { created, failed };
}

/**
 * Update a calendar event's time
 */
export async function updateCalendarEventTime(
  accessToken: string,
  eventId: string,
  newTime: string, // HH:MM
  date: string, // YYYY-MM-DD
  timezone: string,
  durationMin: number = DEFAULT_EVENT_DURATION_MIN
): Promise<void> {
  const calendar = getCalendarClient(accessToken);

  const startDate = new Date(`${date}T${newTime}:00`);
  const endDate = new Date(startDate.getTime() + durationMin * 60 * 1000);

  await calendar.events.patch({
    calendarId: "primary",
    eventId,
    requestBody: {
      start: {
        dateTime: formatDateTime(startDate),
        timeZone: timezone,
      },
      end: {
        dateTime: formatDateTime(endDate),
        timeZone: timezone,
      },
    },
  });
}
