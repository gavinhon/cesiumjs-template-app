const A = 6378137;
const F = 1 / 298.257223563;
const ORIGIN_LAT = 1 + 22 / 60;
const ORIGIN_LON = 103 + 50 / 60;
const FALSE_NORTHING = 38744.572;
const FALSE_EASTING = 28001.642;
const K = 1;

const B = A * (1 - F);
const E2 = 2 * F - F * F;
const E4 = E2 * E2;
const E6 = E4 * E2;
const A0 = 1 - E2 / 4 - (E4 * 3) / 64 - (E6 * 5) / 256;
const A2 = (3 / 8) * (E2 + E4 / 4 + (E6 * 15) / 128);
const A4 = (15 / 256) * (E4 + (E6 * 3) / 4);
const A6 = (E6 * 35) / 3072;

const RAD = Math.PI / 180;

function meridianDistance(latDeg: number): number {
  const lat = latDeg * RAD;
  return A * (A0 * lat - A2 * Math.sin(2 * lat) + A4 * Math.sin(4 * lat) - A6 * Math.sin(6 * lat));
}

const ORIGIN_M = meridianDistance(ORIGIN_LAT);

export interface Svy21 {
  northing: number;
  easting: number;
}

export function toSvy21(latitude: number, longitude: number): Svy21 {
  const lat = latitude * RAD;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const cos2 = cosLat ** 2;
  const cos3 = cos2 * cosLat;
  const cos4 = cos3 * cosLat;
  const cos5 = cos4 * cosLat;
  const cos6 = cos5 * cosLat;
  const cos7 = cos6 * cosLat;
  const t = sinLat / cosLat;
  const t2 = t * t;
  const t4 = t2 * t2;
  const t6 = t4 * t2;

  const denominator = 1 - E2 * sinLat * sinLat;
  const rho = (A * (1 - E2)) / denominator ** 1.5;
  const v = A / Math.sqrt(denominator);
  const psi = v / rho;
  const psi2 = psi * psi;
  const psi3 = psi2 * psi;
  const psi4 = psi3 * psi;

  const w = (longitude - ORIGIN_LON) * RAD;
  const w2 = w * w;
  const w4 = w2 * w2;
  const w6 = w4 * w2;
  const w8 = w6 * w2;

  const n1 = (w2 / 2) * v * sinLat * cosLat;
  const n2 = (w4 / 24) * v * sinLat * cos3 * (4 * psi2 + psi - t2);
  const n3 =
    (w6 / 720) *
    v *
    sinLat *
    cos5 *
    (8 * psi4 * (11 - 24 * t2) -
      28 * psi3 * (1 - 6 * t2) +
      psi2 * (1 - 32 * t2) -
      psi * 2 * t2 +
      t4);
  const n4 = (w8 / 40320) * v * sinLat * cos7 * (1385 - 3111 * t2 + 543 * t4 - t6);
  const northing = FALSE_NORTHING + K * (meridianDistance(latitude) - ORIGIN_M + n1 + n2 + n3 + n4);

  const e1 = (w2 / 6) * cos2 * (psi - t2);
  const e2 =
    (w4 / 120) * cos4 * (4 * psi3 * (1 - 6 * t2) + psi2 * (1 + 8 * t2) - psi * 2 * t2 + t4);
  const e3 = (w6 / 5040) * cos6 * (61 - 479 * t2 + 179 * t4 - t6);
  const easting = FALSE_EASTING + K * v * w * cosLat * (1 + e1 + e2 + e3);

  return { northing, easting };
}

export function fromSvy21(
  northing: number,
  easting: number,
): {
  latitude: number;
  longitude: number;
} {
  const mPrime = ORIGIN_M + (northing - FALSE_NORTHING) / K;
  const n = (A - B) / (A + B);
  const n2 = n * n;
  const n3 = n2 * n;
  const n4 = n2 * n2;
  const g = A * (1 - n) * (1 - n2) * (1 + (9 * n2) / 4 + (225 * n4) / 64) * RAD;
  const sigma = (mPrime * RAD) / g;

  const latPrime =
    sigma +
    ((3 * n) / 2 - (27 * n3) / 32) * Math.sin(2 * sigma) +
    ((21 * n2) / 16 - (55 * n4) / 32) * Math.sin(4 * sigma) +
    ((151 * n3) / 96) * Math.sin(6 * sigma) +
    ((1097 * n4) / 512) * Math.sin(8 * sigma);

  const sinP = Math.sin(latPrime);
  const denominator = 1 - E2 * sinP * sinP;
  const rhoP = (A * (1 - E2)) / denominator ** 1.5;
  const vP = A / Math.sqrt(denominator);
  const psi = vP / rhoP;
  const psi2 = psi * psi;
  const psi3 = psi2 * psi;
  const psi4 = psi3 * psi;
  const t = Math.tan(latPrime);
  const t2 = t * t;
  const t4 = t2 * t2;
  const t6 = t4 * t2;

  const ePrime = easting - FALSE_EASTING;
  const x = ePrime / (K * vP);
  const x3 = x ** 3;
  const x5 = x ** 5;
  const x7 = x ** 7;

  const latFactor = t / (K * rhoP);
  const lat1 = latFactor * ((ePrime * x) / 2);
  const lat2 = latFactor * ((ePrime * x3) / 24) * (-4 * psi2 + 9 * psi * (1 - t2) + 12 * t2);
  const lat3 =
    latFactor *
    ((ePrime * x5) / 720) *
    (8 * psi4 * (11 - 24 * t2) -
      12 * psi3 * (21 - 71 * t2) +
      15 * psi2 * (15 - 98 * t2 + 15 * t4) +
      180 * psi * (5 * t2 - 3 * t4) +
      360 * t4);
  const lat4 = latFactor * ((ePrime * x7) / 40320) * (1385 - 3633 * t2 + 4095 * t4 + 1575 * t6);
  const latitude = (latPrime - lat1 + lat2 - lat3 + lat4) / RAD;

  const sec = 1 / Math.cos(latPrime);
  const lon1 = x * sec;
  const lon2 = ((x3 * sec) / 6) * (psi + 2 * t2);
  const lon3 =
    ((x5 * sec) / 120) *
    (-4 * psi3 * (1 - 6 * t2) + psi2 * (9 - 68 * t2) + 72 * psi * t2 + 24 * t4);
  const lon4 = ((x7 * sec) / 5040) * (61 + 662 * t2 + 1320 * t4 + 720 * t6);
  const longitude = ORIGIN_LON + (lon1 - lon2 + lon3 - lon4) / RAD;

  return { latitude, longitude };
}

export function isWithinSvy21Area(latitude: number, longitude: number): boolean {
  return latitude > 1.1 && latitude < 1.5 && longitude > 103.55 && longitude < 104.1;
}
