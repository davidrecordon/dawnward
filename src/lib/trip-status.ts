const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface TripStatus {
  label: string;
  isUpcoming: boolean;
  isPast: boolean;
}

/**
 * Get relative time description and status for a trip departure date.
 * Returns human-readable labels like "in 2 days", "tomorrow", "yesterday".
 */
export function getTripStatus(
  departureDatetime: string,
  now: Date = new Date()
): TripStatus {
  const departure = new Date(departureDatetime);
  const diffMs = departure.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / MS_PER_DAY);

  // Future trips
  if (diffDays > 1) {
    return { label: `in ${diffDays} days`, isUpcoming: true, isPast: false };
  }
  if (diffDays === 1) {
    return { label: "tomorrow", isUpcoming: true, isPast: false };
  }
  if (diffDays === 0) {
    return { label: "today", isUpcoming: true, isPast: false };
  }

  // Past trips
  if (diffDays === -1) {
    return { label: "yesterday", isUpcoming: false, isPast: true };
  }
  return {
    label: `${Math.abs(diffDays)} days ago`,
    isUpcoming: false,
    isPast: true,
  };
}
