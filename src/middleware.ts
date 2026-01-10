import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

/**
 * Edge-compatible middleware for route protection.
 * Uses the edge-compatible auth config (no Prisma adapter).
 * The authorized callback in authConfig handles the redirect logic.
 */
export default NextAuth(authConfig).auth;

export const config = {
  // Match protected routes
  matcher: ["/history/:path*", "/settings/:path*"],
};
