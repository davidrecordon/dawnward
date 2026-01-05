import type { Airport } from "@/types/airport";

let airportsCache: Airport[] | null = null;

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
  return airportsCache!;
}

/**
 * Search airports by code or city name
 *
 * @param query - Search query (min 2 characters)
 * @param airports - Array of airports to search
 * @param limit - Maximum number of results (default 10)
 * @returns Matching airports sorted by relevance
 */
export function searchAirports(
  query: string,
  airports: Airport[],
  limit: number = 10
): Airport[] {
  const normalizedQuery = query.toLowerCase().trim();

  if (normalizedQuery.length < 2) {
    return [];
  }

  // Score each airport based on match quality
  const scored = airports.map((airport) => {
    let score = 0;
    const code = airport.code.toLowerCase();
    const city = airport.city.toLowerCase();
    const name = airport.name.toLowerCase();

    // Exact code match - highest priority
    if (code === normalizedQuery) {
      score = 1000;
    }
    // Code starts with query - high priority
    else if (code.startsWith(normalizedQuery)) {
      score = 500 + (3 - normalizedQuery.length) * 10; // Prefer shorter matches
    }
    // City starts with query - medium-high priority
    else if (city.startsWith(normalizedQuery)) {
      score = 300;
    }
    // City contains query - medium priority
    else if (city.includes(normalizedQuery)) {
      score = 200;
    }
    // Airport name contains query - lower priority
    else if (name.includes(normalizedQuery)) {
      score = 100;
    }

    return { airport, score };
  });

  // Filter to matches only and sort by score (descending)
  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.airport);
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
