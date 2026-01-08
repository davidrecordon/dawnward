"use client";

import { Analytics as VercelAnalytics } from "@vercel/analytics/react";

/**
 * Check if user has opted out of tracking via privacy signals.
 */
function hasOptedOut(): boolean {
  if (typeof window === "undefined") return false;

  if (
    (navigator as unknown as { globalPrivacyControl?: boolean })
      .globalPrivacyControl === true
  ) {
    return true;
  }

  // DNT is the legacy signal (less standardized but still respected)
  const dnt =
    navigator.doNotTrack ||
    (window as unknown as { doNotTrack?: string }).doNotTrack;
  if (dnt === "1" || dnt === "yes") {
    return true;
  }

  return false;
}

export function Analytics() {
  if (hasOptedOut()) {
    return null;
  }

  return <VercelAnalytics />;
}
