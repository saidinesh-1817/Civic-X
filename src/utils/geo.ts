/**
 * Geographic and GPS Coordinate Utilities for CivicSense
 */

export interface DistanceResult {
  distanceKm: number;
  distanceMeters: number;
}

/**
 * Calculates the great-circle distance between two points on the Earth's surface
 * using the standard Haversine formula.
 *
 * @param lat1 Latitude of first point in decimal degrees
 * @param lon1 Longitude of first point in decimal degrees
 * @param lat2 Latitude of second point in decimal degrees
 * @param lon2 Longitude of second point in decimal degrees
 * @returns DistanceResult with distance in kilometers (rounded to 2 decimal places) and meters
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): DistanceResult {
  const EARTH_RADIUS_KM = 6371; // Earth's mean radius in kilometers

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const radLat1 = toRadians(lat1);
  const radLat2 = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const rawDistanceKm = EARTH_RADIUS_KM * c;

  const distanceKm = Math.round(rawDistanceKm * 100) / 100;
  const distanceMeters = Math.round(rawDistanceKm * 1000);

  return {
    distanceKm,
    distanceMeters,
  };
}

/**
 * Converts degrees to radians
 */
export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Validates whether a latitude coordinate is valid (-90 to 90 degrees)
 */
export function isValidLatitude(lat: number): boolean {
  return typeof lat === 'number' && !isNaN(lat) && lat >= -90 && lat <= 90;
}

/**
 * Validates whether a longitude coordinate is valid (-180 to 180 degrees)
 */
export function isValidLongitude(lon: number): boolean {
  return typeof lon === 'number' && !isNaN(lon) && lon >= -180 && lon <= 180;
}
