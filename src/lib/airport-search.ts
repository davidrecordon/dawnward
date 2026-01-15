import type { Airport } from "@/types/airport";
import type Fuse from "fuse.js";

let airportsCache: Airport[] | null = null;
let fuseInstance: Fuse<Airport> | null = null;
let FuseClass: typeof Fuse | null = null;

/**
 * Load airports from the JSON file (cached after first load)
 */
export async function loadAirports(): Promise<Airport[]> {
  if (airportsCache) {
    return airportsCache;
  }

  const response = await fetch("/data/airports.json");
  if (!response.ok) {
    throw new Error("Failed to load airports data");
  }

  airportsCache = await response.json();
  // Reset fuse instance when airports are reloaded
  fuseInstance = null;
  return airportsCache!;
}

/**
 * Lazy-load Fuse.js library (deferred until first search)
 */
async function loadFuse(): Promise<typeof Fuse> {
  if (!FuseClass) {
    const fuseModule = await import("fuse.js");
    FuseClass = fuseModule.default;
  }
  return FuseClass;
}

/**
 * Get or create Fuse.js instance for searching airports
 */
async function getFuse(airports: Airport[]): Promise<Fuse<Airport>> {
  // Reuse cached instance if airports haven't changed
  if (fuseInstance && airports === airportsCache) {
    return fuseInstance;
  }

  const Fuse = await loadFuse();
  fuseInstance = new Fuse(airports, {
    keys: [
      { name: "code", weight: 3 },
      { name: "city", weight: 2 },
      { name: "name", weight: 1 },
    ],
    threshold: 0.3, // Lower = more strict matching
    includeScore: true,
    ignoreLocation: true, // Search anywhere in the string
    minMatchCharLength: 2,
  });

  return fuseInstance;
}

/**
 * Search airports by code or city name using Fuse.js fuzzy search
 *
 * @param query - Search query (min 2 characters)
 * @param airports - Array of airports to search
 * @param limit - Maximum number of results (default 10)
 * @returns Matching airports sorted by relevance
 */
export async function searchAirports(
  query: string,
  airports: Airport[],
  limit: number = 10
): Promise<Airport[]> {
  const normalizedQuery = query.toLowerCase().trim();

  if (normalizedQuery.length < 2) {
    return [];
  }

  // For exact code matches, prioritize them explicitly
  const exactCodeMatch = airports.find(
    (a) => a.code.toLowerCase() === normalizedQuery
  );

  // For code prefix matches, find them
  const codePrefixMatches = airports.filter(
    (a) =>
      a.code.toLowerCase().startsWith(normalizedQuery) &&
      a.code.toLowerCase() !== normalizedQuery
  );

  // Use Fuse for fuzzy matching on city and name (lazy-loaded)
  const fuse = await getFuse(airports);
  const fuseResults = fuse.search(normalizedQuery, { limit: limit * 2 });

  // Build results with priority ordering:
  // 1. Exact code match (highest)
  // 2. Code prefix matches
  // 3. Fuse.js results (sorted by score)
  const results: Airport[] = [];
  const seen = new Set<string>();

  // Add exact match first
  if (exactCodeMatch) {
    results.push(exactCodeMatch);
    seen.add(exactCodeMatch.code);
  }

  // Add code prefix matches next (sorted by code length for shorter matches)
  codePrefixMatches
    .sort((a, b) => a.code.length - b.code.length)
    .forEach((airport) => {
      if (!seen.has(airport.code)) {
        results.push(airport);
        seen.add(airport.code);
      }
    });

  // Add Fuse results
  fuseResults.forEach(({ item }) => {
    if (!seen.has(item.code)) {
      results.push(item);
      seen.add(item.code);
    }
  });

  return results.slice(0, limit);
}

/**
 * Find an airport by its IATA code
 */
export function findAirportByCode(
  code: string,
  airports: Airport[]
): Airport | undefined {
  return airports.find(
    (airport) => airport.code.toLowerCase() === code.toLowerCase()
  );
}
