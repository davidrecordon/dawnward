/**
 * Detects trips with identical route and flight times but different preferences.
 * Returns a map of tripId -> array of human-readable difference labels.
 * Trips with no duplicates return an empty array.
 */

export interface TripWithPreferences {
  id: string;
  originTz: string;
  destTz: string;
  departureDatetime: string;
  arrivalDatetime: string;
  prepDays: number;
  wakeTime: string;
  sleepTime: string;
  usesMelatonin: boolean;
  usesCaffeine: boolean;
  usesExercise: boolean;
  napPreference: string;
  scheduleIntensity: string;
}

type PreferenceField = keyof Pick<
  TripWithPreferences,
  | "prepDays"
  | "wakeTime"
  | "sleepTime"
  | "usesMelatonin"
  | "usesCaffeine"
  | "usesExercise"
  | "napPreference"
  | "scheduleIntensity"
>;

const PREFERENCE_FIELDS: PreferenceField[] = [
  "prepDays",
  "wakeTime",
  "sleepTime",
  "usesMelatonin",
  "usesCaffeine",
  "usesExercise",
  "napPreference",
  "scheduleIntensity",
];

const NAP_LABELS: Record<string, string> = {
  no: "no naps",
  flight_only: "flight naps",
  all_days: "all naps",
};

export function detectTripDuplicates(
  trips: TripWithPreferences[]
): Map<string, string[]> {
  const result = new Map<string, string[]>();

  if (trips.length === 0) {
    return result;
  }

  // Group by route + departure + arrival (ignore custom routeLabel)
  const groups = new Map<string, TripWithPreferences[]>();
  for (const trip of trips) {
    const key = `${trip.originTz}|${trip.destTz}|${trip.departureDatetime}|${trip.arrivalDatetime}`;
    const group = groups.get(key) || [];
    group.push(trip);
    groups.set(key, group);
  }

  // Process each group
  for (const groupTrips of groups.values()) {
    if (groupTrips.length < 2) {
      // No duplicates - no badges
      for (const trip of groupTrips) {
        result.set(trip.id, []);
      }
      continue;
    }

    // Find which fields vary within this group
    const varyingFields = findVaryingFields(groupTrips);

    if (varyingFields.size === 0) {
      // Exact duplicates - no badges
      for (const trip of groupTrips) {
        result.set(trip.id, []);
      }
      continue;
    }

    // Generate labels for each trip based on varying fields
    for (const trip of groupTrips) {
      const labels = generateLabels(trip, varyingFields);
      result.set(trip.id, labels);
    }
  }

  return result;
}

function findVaryingFields(
  trips: TripWithPreferences[]
): Set<PreferenceField> {
  const varying = new Set<PreferenceField>();
  const first = trips[0];

  for (const field of PREFERENCE_FIELDS) {
    if (trips.some((t) => t[field] !== first[field])) {
      varying.add(field);
    }
  }

  return varying;
}

function generateLabels(
  trip: TripWithPreferences,
  varyingFields: Set<PreferenceField>
): string[] {
  const labels: string[] = [];

  if (varyingFields.has("prepDays")) {
    labels.push(
      `${trip.prepDays} ${trip.prepDays === 1 ? "day" : "days"} prep`
    );
  }
  if (varyingFields.has("wakeTime")) {
    labels.push(`wake ${trip.wakeTime}`);
  }
  if (varyingFields.has("sleepTime")) {
    labels.push(`sleep ${trip.sleepTime}`);
  }
  if (varyingFields.has("usesMelatonin")) {
    labels.push(trip.usesMelatonin ? "melatonin" : "no melatonin");
  }
  if (varyingFields.has("usesCaffeine")) {
    labels.push(trip.usesCaffeine ? "caffeine" : "no caffeine");
  }
  if (varyingFields.has("usesExercise")) {
    labels.push(trip.usesExercise ? "exercise" : "no exercise");
  }
  if (varyingFields.has("napPreference")) {
    labels.push(NAP_LABELS[trip.napPreference] || trip.napPreference);
  }
  if (varyingFields.has("scheduleIntensity")) {
    labels.push(trip.scheduleIntensity);
  }

  return labels;
}
