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

function parseDateParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function addDays(parts: { year: number; month: number; day: number }, adjustment: number) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + adjustment));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function ordinal(day: number) {
  const remainder100 = day % 100;
  if (remainder100 >= 11 && remainder100 <= 13) return `${day}th`;
  const remainder10 = day % 10;
  if (remainder10 === 1) return `${day}st`;
  if (remainder10 === 2) return `${day}nd`;
  if (remainder10 === 3) return `${day}rd`;
  return `${day}th`;
}

export type HijriParts = {
  day: number;
  month: number;
  year: number;
  monthName: string;
  formatted: string;
};

/**
 * Gregorian -> Hijri, returning the numeric components alongside the formatted string.
 *
 * `calculateHijriDate` returns only the display string, which is all the Miqaat screen
 * needs. The membership module needs the parts: a Hijri year on its own for the Ashara
 * Mubaraka year range, and day/month/year to store a Hijri date of birth.
 *
 * Returns null for input that is not a valid YYYY-MM-DD date.
 */
export function calculateHijriParts(value: string, adjustment = 0): HijriParts | null {
  const parsed = parseDateParts(value);
  if (!parsed) return null;

  const { day, month, year } = adjustment ? addDays(parsed, adjustment) : parsed;
  let m = month;
  let y = year;
  if (m < 3) {
    y -= 1;
    m += 12;
  }

  const a = Math.floor(y / 100);
  let b = 2 - a + Math.floor(a / 4);
  if (y < 1583) b = 0;
  if (y === 1582) {
    if (m > 10) b = -10;
    if (m === 10) {
      b = 0;
      if (day > 4) b = -10;
    }
  }

  const jd = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524;

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
  if (im === 13) im = 12;
  const id = z - Math.floor(29.5001 * im - 29);

  const monthName = HIJRI_MONTH_NAMES[im - 1];
  if (!monthName) return null;

  return {
    day: id,
    month: im,
    year: iy,
    monthName,
    formatted: `${ordinal(id)} ${monthName} ${iy} AH`
  };
}

export function calculateHijriDate(value: string, adjustment = 0) {
  return calculateHijriParts(value, adjustment)?.formatted ?? "";
}
