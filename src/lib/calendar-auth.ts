"use client";

import { signIn } from "next-auth/react";
import { CALENDAR_SCOPES } from "@/auth.config";

/**
 * Initiate OAuth flow to request Google Calendar permissions.
 * Uses incremental authorization to add calendar scope to existing session.
 *
 * @param callbackUrl - URL to redirect to after authorization
 */
export function requestCalendarPermission(callbackUrl: string): void {
  signIn(
    "google",
    { callbackUrl },
    {
      scope: CALENDAR_SCOPES,
      include_granted_scopes: "true",
      prompt: "consent",
    }
  );
}
