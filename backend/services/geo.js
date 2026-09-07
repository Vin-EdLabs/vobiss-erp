/**
 * Coordinate parsing + distance math shared by Sites (paste-any-format GPS) and Field Work
 * ("Confirm I'm here" arrival checks).
 */

const DEC_PAIR_RE = /^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/;
const MAPS_URL_RE = /[@?&]q?=?(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/;
const DMS_RE =
  /(\d{1,3})[°\s]+(\d{1,2})['′\s]+(\d{1,2}(?:\.\d+)?)["″\s]*([NSns])[,\s]+(\d{1,3})[°\s]+(\d{1,2})['′\s]+(\d{1,2}(?:\.\d+)?)["″\s]*([EWew])/;

function isValidLatLng(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function dmsToDecimal(deg, min, sec, hemisphere) {
  const value = Number(deg) + Number(min) / 60 + Number(sec) / 3600;
  return /[SsWw]/.test(hemisphere) ? -value : value;
}

/**
 * Accepts whatever a person pastes — plain "lat, lng" decimal degrees (the overwhelming common
 * case), a Google Maps URL/share link, or DMS with N/S/E/W markers — and returns decimal
 * degrees, or null if none of those patterns match. Never throws: an unparseable paste still
 * lets the site save, it just won't get a map link.
 */
export function parseCoordinates(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;

  const mapsMatch = text.match(MAPS_URL_RE);
  if (mapsMatch) {
    const lat = Number(mapsMatch[1]);
    const lng = Number(mapsMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  const dmsMatch = text.match(DMS_RE);
  if (dmsMatch) {
    const lat = dmsToDecimal(dmsMatch[1], dmsMatch[2], dmsMatch[3], dmsMatch[4]);
    const lng = dmsToDecimal(dmsMatch[5], dmsMatch[6], dmsMatch[7], dmsMatch[8]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  const decMatch = text.match(DEC_PAIR_RE);
  if (decMatch) {
    const lat = Number(decMatch[1]);
    const lng = Number(decMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  return null;
}

const EARTH_RADIUS_M = 6371000;

/** Great-circle distance between two {lat,lng} points, in meters. */
export function haversineMeters(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h)));
}
