import { prisma } from "@/lib/prisma";

const TOKEN_REFRESH_BUFFER_MS = 60 * 1000; // Refresh 60s before expiry

interface TokenResult {
  accessToken: string;
  expiresAt: Date;
}

/**
 * Get a valid Google access token for a user, refreshing if expired.
 * This is for server-side use outside of NextAuth sessions (scripts, background jobs).
 */
export async function getValidAccessToken(
  userId: string
): Promise<TokenResult> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });

  if (!account) {
    throw new Error(`No Google account found for user: ${userId}`);
  }

  if (!account.refresh_token) {
    throw new Error(
      "No refresh token available. User must sign in with 'offline' access."
    );
  }

  // Check if token needs refresh (expired or will expire within buffer)
  const expiresAt = account.expires_at ? account.expires_at * 1000 : 0;
  const needsRefresh = Date.now() > expiresAt - TOKEN_REFRESH_BUFFER_MS;

  if (!needsRefresh && account.access_token) {
    return {
      accessToken: account.access_token,
      expiresAt: new Date(expiresAt),
    };
  }

  // Refresh the token
  console.log("[TokenRefresh] Refreshing expired access token...");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    // Only log safe error fields, not the full response
    console.error("[TokenRefresh] Failed to refresh token:", {
      error: data.error,
      error_description: data.error_description,
    });
    throw new Error(
      `Token refresh failed: ${data.error_description || data.error || "Unknown error"}`
    );
  }

  // Calculate new expiration
  const newExpiresAt = Math.floor(Date.now() / 1000) + data.expires_in;

  // Update the database with new tokens
  await prisma.account.update({
    where: {
      provider_providerAccountId: {
        provider: "google",
        providerAccountId: account.providerAccountId,
      },
    },
    data: {
      access_token: data.access_token,
      expires_at: newExpiresAt,
      // Keep existing refresh_token if Google doesn't return new one
      ...(data.refresh_token && { refresh_token: data.refresh_token }),
    },
  });

  console.log("[TokenRefresh] Token refreshed successfully");

  return {
    accessToken: data.access_token,
    expiresAt: new Date(newExpiresAt * 1000),
  };
}
