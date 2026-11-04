"use strict";
// Gregorian -> Hijri conversion, ported from frontend/src/utils/hijriDate.ts.
//
// Why a second copy rather than a shared module: this repo has no npm workspaces and no
// root lockfile, so introducing shared-package tooling for ~70 dependency-free lines is
// out of proportion. The two copies are kept honest by a shared fixture -
// src/__tests__/fixtures/hijriVectors.ts - which both test suites assert against, so a
// change to one that is not mirrored in the other fails the build.
//
// The server needs its own copy because derived Hijri values must be computed here and
// never trusted from the browser, and because the Ashara Mubaraka year range is bounded
// by the current Hijri year, which the client must not be able to set.
//
// The month names are the Dawoodi Bohra forms already used by the Miqaat screen.
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateHijriParts = calculateHijriParts;
exports.calculateHijriDate = calculateHijriDate;
exports.currentHijriYear = currentHijriYear;
const HIJRI_MONTH_NAMES = [
    "Moharram-ul-Haram",
    "Safar-ul-Muzzafar",
    "Rabi-ul-Awwal",
    "Rabi-ul-Akhar",
    "Jammad-il-Ula",
    "Jammad-il-Ukhra",
    "Rajab-ul-Asab",
    "Shaban-ul-Karim",
    "Ramadan-al-Moazzam",
    "Shawwal-ul-Mukkaram",
    "Zilqadatil-Haram",
    "Zilhajjatil-Haram"
];
function parseDateParts(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
    if (!match)
        return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day))
        return null;
    // Round-trip through Date to reject impossible calendar dates such as 2026-02-30,
    // which the regex alone accepts.
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day) {
        return null;
    }
    return { year, month, day };
}
function addDays(parts, adjustment) {
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + adjustment));
    return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate()
    };
}
function ordinal(day) {
    const remainder100 = day % 100;
    if (remainder100 >= 11 && remainder100 <= 13)
        return `${day}th`;
    const remainder10 = day % 10;
    if (remainder10 === 1)
        return `${day}st`;
    if (remainder10 === 2)
        return `${day}nd`;
    if (remainder10 === 3)
        return `${day}rd`;
    return `${day}th`;
}
/**
 * Converts a YYYY-MM-DD Gregorian date to Hijri, returning the numeric components and the
 * formatted display string. `adjustment` is a +/- day offset for moon-sighting correction.
 *
 * Returns null for anything that is not a valid calendar date.
 */
function calculateHijriParts(value, adjustment = 0) {
    const parsed = parseDateParts(value);
    if (!parsed)
        return null;
    const { day, month, year } = adjustment ? addDays(parsed, adjustment) : parsed;
    let m = month;
    let y = year;
    if (m < 3) {
        y -= 1;
        m += 12;
    }
    // Gregorian -> Julian Day, handling the 1582 calendar reform.
    const a = Math.floor(y / 100);
    let b = 2 - a + Math.floor(a / 4);
    if (y < 1583)
        b = 0;
    if (y === 1582) {
        if (m > 10)
            b = -10;
        if (m === 10) {
            b = 0;
            if (day > 4)
                b = -10;
        }
    }
    const jd = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524;
    // Julian Day -> arithmetic (tabular) Islamic calendar.
    const iyear = 10631 / 30;
    const epochastro = 1948084;
    const shift1 = 8.01 / 60;
    let z = jd - epochastro;
    const cyc = Math.floor(z / 10631);
    z -= 10631 * cyc;
    const j = Math.floor((z - shift1) / iyear);
    const iy = 30 * cyc + j;
    z -= Math.floor(j * iyear + shift1);
    let im = Math.floor((z + 28.5001) / 29.5);
    if (im === 13)
        im = 12;
    const id = z - Math.floor(29.5001 * im - 29);
    const monthName = HIJRI_MONTH_NAMES[im - 1];
    if (!monthName)
        return null;
    return {
        day: id,
        month: im,
        year: iy,
        monthName,
        formatted: `${ordinal(id)} ${monthName} ${iy} AH`
    };
}
/** Formatted display string only, matching the frontend's `calculateHijriDate`. */
function calculateHijriDate(value, adjustment = 0) {
    return calculateHijriParts(value, adjustment)?.formatted ?? "";
}
/**
 * The current Hijri year, used as the upper bound of the Ashara Mubaraka year range.
 * Computed server-side so a client cannot widen the range by changing its own clock.
 */
function currentHijriYear(now = new Date()) {
    const iso = [
        String(now.getUTCFullYear()).padStart(4, "0"),
        String(now.getUTCMonth() + 1).padStart(2, "0"),
        String(now.getUTCDate()).padStart(2, "0")
    ].join("-");
    const parts = calculateHijriParts(iso);
    if (!parts) {
        // Unreachable for a real Date, but throwing beats silently returning a wrong bound.
        throw new Error(`Could not derive the current Hijri year from ${iso}`);
    }
    return parts.year;
}
