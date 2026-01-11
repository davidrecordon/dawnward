/**
 * In-memory sliding window rate limiter.
 *
 * Tracks requests per IP address using a Map of timestamps.
 * Resets on deployment (acceptable for public read-only endpoint).
 */

// Store request timestamps per IP
const requestLog = new Map<string, number[]>();

// Cleanup counter to prevent memory leaks
let requestCount = 0;
const CLEANUP_INTERVAL = 1000;

// Maximum unique IPs to track (prevents memory exhaustion attacks)
const MAX_TRACKED_IPS = 10000;

/**
 * Check if an IP is within rate limits and record the request.
 *
 * @param ip - Client IP address
 * @param limit - Maximum requests per hour (default: 100)
 * @returns true if request is allowed, false if rate limited
 */
export function checkRateLimit(ip: string, limit = 100): boolean {
  const now = Date.now();
  const hourAgo = now - 3600000; // 1 hour in milliseconds

  // Get existing timestamps and filter to last hour
  const timestamps = (requestLog.get(ip) || []).filter((ts) => ts > hourAgo);

  // Check if over limit
  if (timestamps.length >= limit) {
    return false;
  }

  // Record this request
  timestamps.push(now);
  requestLog.set(ip, timestamps);

  // Periodic cleanup to prevent memory leaks
  requestCount++;
  if (requestCount >= CLEANUP_INTERVAL) {
    cleanupExpiredEntries();
    requestCount = 0;
  }

  // Enforce max tracked IPs to prevent memory exhaustion
  if (requestLog.size > MAX_TRACKED_IPS) {
    evictOldestEntries();
  }

  return true;
}

/**
 * Get current rate limit status for an IP.
 *
 * @param ip - Client IP address
 * @param limit - Maximum requests per hour (default: 100)
 * @returns Object with used count, limit, and reset time
 */
export function getRateLimitStatus(
  ip: string,
  limit = 100
): {
  used: number;
  limit: number;
  resetAt: Date;
} {
  const now = Date.now();
  const hourAgo = now - 3600000;

  const timestamps = (requestLog.get(ip) || []).filter((ts) => ts > hourAgo);
  const oldestTimestamp = timestamps.length > 0 ? timestamps[0] : now;

  return {
    used: timestamps.length,
    limit,
    resetAt: new Date(oldestTimestamp + 3600000),
  };
}

/**
 * Remove expired entries from the request log.
 * Called periodically to prevent memory leaks.
 */
function cleanupExpiredEntries(): void {
  const hourAgo = Date.now() - 3600000;

  for (const [ip, timestamps] of requestLog.entries()) {
    const valid = timestamps.filter((ts) => ts > hourAgo);
    if (valid.length === 0) {
      requestLog.delete(ip);
    } else {
      requestLog.set(ip, valid);
    }
  }
}

/**
 * Evict oldest entries when Map exceeds MAX_TRACKED_IPS.
 * Removes 10% of entries (oldest by last request time).
 */
function evictOldestEntries(): void {
  const entriesToEvict = Math.ceil(MAX_TRACKED_IPS * 0.1);

  // Get entries sorted by most recent timestamp (oldest first)
  const sorted = [...requestLog.entries()].sort((a, b) => {
    const aLatest = a[1].length > 0 ? a[1][a[1].length - 1] : 0;
    const bLatest = b[1].length > 0 ? b[1][b[1].length - 1] : 0;
    return aLatest - bLatest;
  });

  // Remove oldest entries
  for (let i = 0; i < entriesToEvict && i < sorted.length; i++) {
    requestLog.delete(sorted[i][0]);
  }
}

/**
 * Clear all rate limit data (for testing).
 */
export function clearRateLimits(): void {
  requestLog.clear();
  requestCount = 0;
}
