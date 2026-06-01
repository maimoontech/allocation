export function formatDateDdMmmYy(value: string | Date | null | undefined) {
  if (!value) return "—";

  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);

  const isDateOnlyString = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    timeZone: isDateOnlyString ? "UTC" : undefined
  });

  const parts = formatter.formatToParts(date);
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const year = parts.find((p) => p.type === "year")?.value ?? "";

  if (!day || !month || !year) return formatter.format(date).replaceAll(" ", "/");
  return `${day}/${month}/${year}`;
}

