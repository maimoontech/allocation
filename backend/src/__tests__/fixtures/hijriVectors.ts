// Canonical Gregorian -> Hijri test vectors.
//
// GOLDEN MASTER: every value below was captured from the ORIGINAL
// frontend/src/utils/hijriDate.ts implementation before it was refactored to expose
// numeric parts. They therefore pin the behaviour the Miqaat screen has always had, and
// any change to either implementation that alters a single one of these is a regression,
// not an improvement.
//
// Both test suites import this one file:
//   backend/src/__tests__/hijriDate.test.ts
//   frontend/src/utils/hijriDate.test.ts
// so a change made to one copy of the algorithm and not the other fails the build.

export type HijriVector = {
  gregorian: string;
  day: number;
  month: number;
  year: number;
  formatted: string;
  note?: string;
};

export const HIJRI_VECTORS: HijriVector[] = [
  { gregorian: "1582-10-04", day: 17, month: 9, year: 990, formatted: "17th Ramadan-al-Moazzam 990 AH", note: "last Julian day before the Gregorian reform" },
  { gregorian: "1582-10-15", day: 18, month: 9, year: 990, formatted: "18th Ramadan-al-Moazzam 990 AH", note: "first Gregorian day after the reform" },
  { gregorian: "1583-01-01", day: 7, month: 12, year: 990, formatted: "7th Zilhajjatil-Haram 990 AH", note: "first year the standard b-correction applies" },
  { gregorian: "1900-01-01", day: 29, month: 8, year: 1317, formatted: "29th Shaban-ul-Karim 1317 AH", note: "non-leap century year" },
  { gregorian: "1950-06-15", day: 29, month: 8, year: 1369, formatted: "29th Shaban-ul-Karim 1369 AH", note: "lower bound of the Title/Prefix year range" },
  { gregorian: "1960-11-30", day: 11, month: 6, year: 1380, formatted: "11th Jammad-il-Ukhra 1380 AH" },
  { gregorian: "1970-01-01", day: 23, month: 10, year: 1389, formatted: "23rd Shawwal-ul-Mukkaram 1389 AH", note: "Unix epoch" },
  { gregorian: "1980-07-13", day: 1, month: 9, year: 1400, formatted: "1st Ramadan-al-Moazzam 1400 AH", note: "1400 AH is the lower bound of the Ashara Mubaraka range" },
  { gregorian: "1990-01-01", day: 4, month: 6, year: 1410, formatted: "4th Jammad-il-Ukhra 1410 AH" },
  { gregorian: "1999-12-31", day: 24, month: 9, year: 1420, formatted: "24th Ramadan-al-Moazzam 1420 AH" },
  { gregorian: "2000-02-29", day: 25, month: 11, year: 1420, formatted: "25th Zilqadatil-Haram 1420 AH", note: "leap day in a leap century" },
  { gregorian: "2010-08-11", day: 2, month: 9, year: 1431, formatted: "2nd Ramadan-al-Moazzam 1431 AH" },
  { gregorian: "2024-02-29", day: 20, month: 8, year: 1445, formatted: "20th Shaban-ul-Karim 1445 AH", note: "leap day" },
  { gregorian: "2026-01-01", day: 13, month: 7, year: 1447, formatted: "13th Rajab-ul-Asab 1447 AH" },
  { gregorian: "2026-06-07", day: 22, month: 12, year: 1447, formatted: "22nd Zilhajjatil-Haram 1447 AH" },
  { gregorian: "2026-10-29", day: 18, month: 5, year: 1448, formatted: "18th Jammad-il-Ula 1448 AH", note: "the date this fixture was captured" },
  { gregorian: "2026-12-31", day: 22, month: 7, year: 1448, formatted: "22nd Rajab-ul-Asab 1448 AH" },
  { gregorian: "2100-03-01", day: 20, month: 12, year: 1523, formatted: "20th Zilhajjatil-Haram 1523 AH", note: "far future, past a non-leap century" }
];

/** The moon-sighting day offset, which must shift the Hijri day by exactly that many days. */
export const HIJRI_ADJUSTMENT_VECTORS = [
  { gregorian: "2026-10-29", adjustment: 1, formatted: "19th Jammad-il-Ula 1448 AH" },
  { gregorian: "2026-10-29", adjustment: -1, formatted: "17th Jammad-il-Ula 1448 AH" },
  { gregorian: "2026-10-29", adjustment: -2, formatted: "16th Jammad-il-Ula 1448 AH" }
];

/**
 * Input that must yield no Hijri date at all. The original returns "" for each of these,
 * so the refactored `calculateHijriDate` must too, and `calculateHijriParts` must
 * return null.
 */
export const HIJRI_INVALID_INPUTS = [
  "",
  "   ",
  "not-a-date",
  "2026-13-01",
  "2026-00-01",
  "2026-02-30",
  "2026-04-31",
  "26-01-01",
  "2026-1-1",
  "2026/10/29",
  "29-10-2026"
];
