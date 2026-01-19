import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { GOOGLE_CALENDAR_SCOPE } from "@/auth.config";

/**
 * Verify the actual token scopes with Google's tokeninfo endpoint.
 * This catches cases where:
 * - The stored session scope is stale
 * - The user revoked access in Google settings
 * - The token was refreshed without calendar scope
 */
async function verifyTokenScopes(
  accessToken: string
): Promise<{ valid: boolean; scopes: string[]; error?: string }> {
  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
    );

    if (!response.ok) {
      // Token is invalid or expired
      return { valid: false, scopes: [], error: "Token invalid or expired" };
    }

    const data = await response.json();
    const scopes = data.scope ? data.scope.split(" ") : [];

    return { valid: true, scopes };
  } catch (error) {
    console.error("[Calendar Verify] Error checking token:", error);
    return { valid: false, scopes: [], error: "Failed to verify token" };
  }
}

/**
 * GET /api/calendar/verify
 * Verify that the current session's access token actually has calendar scope.
 * Returns the actual scope status from Google, not the stored session value.
 */
export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // If no access token in session, definitely no calendar access
  if (!session.accessToken) {
    return NextResponse.json({
      hasCalendarScope: false,
      reason: "no_token",
      sessionSaysHasScope: session.hasCalendarScope ?? false,
    });
  }

  // Verify the actual token scopes with Google
  const verification = await verifyTokenScopes(session.accessToken);

  if (!verification.valid) {
    return NextResponse.json({
      hasCalendarScope: false,
      reason: "token_invalid",
      error: verification.error,
      sessionSaysHasScope: session.hasCalendarScope ?? false,
    });
  }

  // Check if calendar scope is in the actual granted scopes
  const hasCalendarScope = verification.scopes.includes(GOOGLE_CALENDAR_SCOPE);

  return NextResponse.json({
    hasCalendarScope,
    reason: hasCalendarScope ? "verified" : "scope_missing",
    grantedScopes: verification.scopes,
    sessionSaysHasScope: session.hasCalendarScope ?? false,
    // Flag if there's a mismatch between session and actual
    mismatch: hasCalendarScope !== (session.hasCalendarScope ?? false),
  });
}
