export const APP_TIME_ZONE = "America/Toronto";
export const APP_LOCALE = "fr-CA";

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const montrealDateTimeFormatter = new Intl.DateTimeFormat(APP_LOCALE, {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});

export function formatMontrealDate(date: Date | string, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat(APP_LOCALE, { timeZone: APP_TIME_ZONE, ...options }).format(toDate(date));
}

export function formatMontrealTime(date: Date | string) {
  return formatMontrealDate(date, { hour: "2-digit", minute: "2-digit" });
}

export function parseMontrealSessionDate(date: string, time = "16:30") {
  return parseMontrealDateTimeInput(`${date}T${time}`);
}

export function parseMontrealDateTimeInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error("Date de seance invalide.");
  }

  return montrealPartsToUtcDate({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: 0
  });
}

export function toMontrealDateInputValue(date = new Date()) {
  const parts = getMontrealParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function toMontrealDateTimeInputValue(date: Date | string) {
  const parts = getMontrealParts(toDate(date));
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function startOfMontrealDay(date = new Date()) {
  const parts = getMontrealParts(date);
  return montrealPartsToUtcDate({ ...parts, hour: 0, minute: 0, second: 0 });
}

export function startOfMontrealWeek(date = new Date()) {
  const parts = getMontrealParts(date);
  const currentNoonUtc = montrealPartsToUtcDate({ ...parts, hour: 12, minute: 0, second: 0 });
  const weekday = montrealWeekday(currentNoonUtc);
  const mondayNoon = addMontrealDays(currentNoonUtc, -(weekday - 1));
  const mondayParts = getMontrealParts(mondayNoon);
  return montrealPartsToUtcDate({ ...mondayParts, hour: 0, minute: 0, second: 0 });
}

export function addMontrealDays(date: Date, days: number) {
  const parts = getMontrealParts(date);
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0));
  const shiftedParts = getMontrealParts(shifted);
  return montrealPartsToUtcDate({ ...shiftedParts, hour: parts.hour, minute: parts.minute, second: parts.second });
}

export function sameMontrealDay(left: Date, right: Date) {
  const leftParts = getMontrealParts(left);
  const rightParts = getMontrealParts(right);
  return leftParts.year === rightParts.year && leftParts.month === rightParts.month && leftParts.day === rightParts.day;
}

function montrealWeekday(date: Date) {
  const value = date.toLocaleDateString("en-CA", { timeZone: APP_TIME_ZONE, weekday: "short" });
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(value) + 1 || 7;
}

function montrealPartsToUtcDate(parts: DateParts) {
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const firstOffset = getTimeZoneOffsetMs(new Date(utcGuess));
  const firstUtc = utcGuess - firstOffset;
  const secondOffset = getTimeZoneOffsetMs(new Date(firstUtc));
  return new Date(utcGuess - secondOffset);
}

function getTimeZoneOffsetMs(date: Date) {
  const parts = getMontrealParts(date);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function getMontrealParts(date: Date): DateParts {
  const values = Object.fromEntries(
    montrealDateTimeFormatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)])
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second
  };
}

function toDate(date: Date | string) {
  return typeof date === "string" ? new Date(date) : date;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
