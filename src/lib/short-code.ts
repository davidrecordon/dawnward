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
  let code = "";

  // Use rejection sampling to avoid modulo bias when mapping bytes to base62 indices.
  // 62 * 4 = 248, so values in [0, 247] map evenly into 62 buckets via modulo.
  while (code.length < length) {
    const byte = randomBytes(1)[0];
    if (byte >= 248) {
      continue;
    }
    code += BASE62[byte % 62];
  }

  return code;
}
