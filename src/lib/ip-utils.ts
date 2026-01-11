/**
 * IP address extraction utilities for rate limiting.
 *
 * Handles Vercel/proxy headers to get the real client IP.
 */

// IPv4 and IPv6 validation patterns
const IPV4_PATTERN = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_PATTERN = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;

/**
 * Validate that a string looks like an IP address.
 * Basic validation to prevent obvious spoofing attempts.
 */
function isValidIP(ip: string): boolean {
  return IPV4_PATTERN.test(ip) || IPV6_PATTERN.test(ip);
}

/**
 * Extract the client IP address from request headers.
 *
 * Checks headers in order of reliability:
 * 1. x-vercel-forwarded-for (set by Vercel, cannot be spoofed)
 * 2. x-forwarded-for (set by proxies, first IP is client)
 * 3. x-real-ip (set by some proxies)
 * 4. Falls back to localhost for local development
 *
 * All IPs are validated to prevent spoofing with malformed values.
 *
 * @param request - The incoming request
 * @returns Client IP address
 */
export function getClientIP(request: Request): string {
  // x-vercel-forwarded-for is set by Vercel and cannot be spoofed by clients
  const vercelForwarded = request.headers.get("x-vercel-forwarded-for");
  if (vercelForwarded) {
    const firstIp = vercelForwarded.split(",")[0].trim();
    if (firstIp && isValidIP(firstIp)) {
      return firstIp;
    }
  }

  // x-forwarded-for can contain multiple IPs: "client, proxy1, proxy2"
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const firstIp = forwarded.split(",")[0].trim();
    if (firstIp && isValidIP(firstIp)) {
      return firstIp;
    }
  }

  // x-real-ip is typically the original client IP
  const realIp = request.headers.get("x-real-ip");
  if (realIp && isValidIP(realIp)) {
    return realIp;
  }

  // Fallback for local development
  return "127.0.0.1";
}
