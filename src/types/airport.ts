/**
 * Airport data structure matching the generated airports.json
 */
export interface Airport {
  /** IATA 3-letter code (e.g., "SFO") */
  code: string;
  /** Full airport name (e.g., "San Francisco International") */
  name: string;
  /** City name (e.g., "San Francisco") */
  city: string;
  /** ISO 2-letter country code (e.g., "US") */
  country: string;
  /** IANA timezone identifier (e.g., "America/Los_Angeles") */
  tz: string;
}
