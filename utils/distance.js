// utils/distance.js
// Haversine formula for calculating distance between two GPS coordinates

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lng1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lng2 - Longitude of point 2
 * @returns {number} Distance in meters
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c; // Distance in meters
  return Math.round(distance);
}

/**
 * Check if location is within acceptable radius of hospital
 * @param {number} lat1 - User latitude
 * @param {number} lng1 - User longitude
 * @param {number} lat2 - Hospital latitude
 * @param {number} lng2 - Hospital longitude
 * @param {number} radiusMeters - Acceptable radius in meters (default 100m)
 * @returns {object} { verified: boolean, distance: number }
 */
function verifyLocation(lat1, lng1, lat2, lng2, radiusMeters = 100) {
  const distance = calculateDistance(lat1, lng1, lat2, lng2);
  return {
    verified: distance <= radiusMeters,
    distance: distance
  };
}

module.exports = {
  calculateDistance,
  verifyLocation
};
