import { format, parse, startOfDay } from "date-fns";

export function toDayStart(date: Date) {
  return startOfDay(date);
}

export function formatDateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function parseDateKey(value: string) {
  const parsed = parse(value, "yyyy-MM-dd", new Date());
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date format, expected YYYY-MM-DD");
  }
  return startOfDay(parsed);
}

export function todayDateKey() {
  return formatDateKey(startOfDay(new Date()));
}

export function formatTimeOnly(date: Date | null) {
  if (!date) {
    return "-";
  }
  return format(date, "HH:mm");
}

export function parseDeadlineToMinutes(deadline: string) {
  const [hRaw, mRaw] = deadline.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error("Deadline must be HH:mm");
  }
  return h * 60 + m;
}

export function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}
