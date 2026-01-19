import type { NextAuthConfig } from "next-auth";
import type { JWT } from "next-auth/jwt";
import Google from "next-auth/providers/google";

/** Google Calendar events scope for write-only access */
export const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";

/** Refresh access token 1 minute before expiry to avoid race conditions */
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

/** Base scopes for sign-in (no calendar) */
const BASE_SCOPES = "openid email profile";

/** Full scopes including calendar (for re-auth) */
export const CALENDAR_SCOPES = `${BASE_SCOPES} ${GOOGLE_CALENDAR_SCOPE}`;

/**
 * Check if JWT has calendar scope
 */
export function hasCalendarScope(token: JWT): boolean {
  return token.scope?.includes("calendar.events") ?? false;
}

/**
 * Refresh an expired access token using the refresh token
 */
async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken!,
      }),
    });

    const refreshed = await response.json();

    if (!response.ok) {
      throw refreshed;
    }

    return {
      ...token,
      accessToken: refreshed.access_token,
      accessTokenExpires: Date.now() + refreshed.expires_in * 1000,
      // Keep existing refresh token if not returned
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
    };
  } catch (error) {
    console.error("Error refreshing access token:", error);
    // Return token without access token to force re-auth
    return {
      ...token,
      accessToken: undefined,
      accessTokenExpires: undefined,
      error: "RefreshAccessTokenError",
    };
  }
}

/**
 * Edge-compatible auth configuration.
 * This config is used by middleware and doesn't include database adapters.
 * The full auth config in auth.ts extends this with the Prisma adapter.
 */
export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: BASE_SCOPES,
          access_type: "offline",
          prompt: "consent",
          // Include any previously granted scopes (like calendar) in the token
          // This way: new users get base scopes, returning users who granted
          // calendar before automatically get calendar scope included
          include_granted_scopes: "true",
        },
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isProtectedRoute =
        nextUrl.pathname.startsWith("/trips") ||
        nextUrl.pathname.startsWith("/settings");

      if (isProtectedRoute && !isLoggedIn) {
        const signInUrl = new URL("/auth/signin", nextUrl);
        signInUrl.searchParams.set("callbackUrl", nextUrl.pathname);
        return Response.redirect(signInUrl);
      }

      return true;
    },
    async jwt({ token, user, account }) {
      // Initial sign-in: capture tokens from account
      if (account && user) {
        token.id = user.id;
        token.accessToken = account.access_token ?? undefined;
        token.refreshToken = account.refresh_token ?? undefined;
        token.accessTokenExpires = account.expires_at
          ? account.expires_at * 1000
          : undefined;
        token.scope = account.scope ?? undefined;
        return token;
      }

      // Return token as-is if no expiry or not expired
      if (
        !token.accessTokenExpires ||
        Date.now() < token.accessTokenExpires - TOKEN_REFRESH_BUFFER_MS
      ) {
        return token;
      }

      // Token expired, try to refresh
      if (token.refreshToken) {
        return refreshAccessToken(token);
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }

      // Check for token refresh errors - if refresh failed, calendar scope is invalid
      if (token.error === "RefreshAccessTokenError") {
        session.hasCalendarScope = false;
        // Don't expose invalid access token
        return session;
      }

      session.hasCalendarScope = hasCalendarScope(token);
      if (session.hasCalendarScope && token.accessToken) {
        session.accessToken = token.accessToken;
        session.accessTokenExpires = token.accessTokenExpires;
      }
      return session;
    },
  },
};
