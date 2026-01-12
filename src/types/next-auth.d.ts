import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
    /** Whether user has granted Google Calendar access */
    hasCalendarScope: boolean;
    /** Access token for Google APIs (only if calendar scope granted) */
    accessToken?: string;
    /** Token expiration timestamp */
    accessTokenExpires?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    scope?: string;
  }
}
