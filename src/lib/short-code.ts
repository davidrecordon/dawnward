/**
 * Short code generation for shareable URLs.
 * Uses cryptographically secure random generation.
 */

import { randomBytes } from "crypto";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * Generate a cryptographically secure base62 short code.
 *
 * @param length - Number of characters (default 6)
 * @returns Random base62 string (e.g., "a1B2c3")
 */
export function generateShortCode(length = 6): string {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    // Use modulo to map byte to base62 character
    code += BASE62[bytes[i] % 62];
  }
  return code;
}
