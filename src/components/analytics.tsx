"use client";

import dynamic from "next/dynamic";

// Defer loading Vercel Analytics until after hydration
const VercelAnalytics = dynamic(
  () => import("@vercel/analytics/react").then((m) => m.Analytics),
  { ssr: false }
);

/**
 * Check if user has opted out of tracking via privacy signals.
 */
function hasOptedOut(): boolean {
  if (typeof window === "undefined") return false;

  // Global Privacy Control (modern standard)
  const gpc = (navigator as unknown as { globalPrivacyControl?: boolean })
    .globalPrivacyControl;
  if (gpc === true) return true;

  // DNT is the legacy signal (less standardized but still respected)
  const dnt =
    navigator.doNotTrack ||
    (window as unknown as { doNotTrack?: string }).doNotTrack;
  return dnt === "1" || dnt === "yes";
}

export function Analytics() {
  if (hasOptedOut()) {
    return null;
  }

  return <VercelAnalytics />;
}
