/**
 * Authentication utilities for safe URL handling.
 */

/**
 * Validate callbackUrl to prevent open redirect attacks.
 * Only allows relative paths starting with "/" (not "//").
 *
 * @param callbackUrl - The callback URL to validate
 * @returns A safe URL (the original if valid, "/" otherwise)
 */
export function getSafeCallbackUrl(callbackUrl: string | undefined): string {
  if (!callbackUrl) return "/";
  // Must start with "/" but not "//" (protocol-relative URL)
  if (callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")) {
    return callbackUrl;
  }
  return "/";
}
