/**
 * Date utilities — all dates go through here.
 * Uses date-fns for correctness (local timezone, not UTC).
 *
 * NEVER use `new Date().toISOString().split('T')[0]` — that converts to UTC
 * and returns tomorrow's date for anyone west of UTC after ~5pm local time.
 */

import { format, addDays, subDays, startOfMonth, endOfMonth, isToday, isSameDay, addMonths, subMonths, startOfDay, differenceInDays, eachDayOfInterval } from 'date-fns';

/** Returns today's date as 'YYYY-MM-DD' in local timezone */
export function getLocalDateString(date: Date = new Date()): string {
  return format(date, 'yyyy-MM-dd');
}

/** Parses a 'YYYY-MM-DD' string into a Date at midnight local time */
export function parseLocalDate(dateStr: string): Date {
  // parseISO treats date-only strings as UTC — we want local
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Navigate days forward/backward from a date string */
export function getNextDay(dateStr: string): string {
  return getLocalDateString(addDays(parseLocalDate(dateStr), 1));
}

export function getPrevDay(dateStr: string): string {
  return getLocalDateString(subDays(parseLocalDate(dateStr), 1));
}

/** Month boundaries */
export function getMonthStart(dateStr: string): string {
  return getLocalDateString(startOfMonth(parseLocalDate(dateStr)));
}

export function getMonthEnd(dateStr: string): string {
  return getLocalDateString(endOfMonth(parseLocalDate(dateStr)));
}

/** Month navigation */
export function getNextMonth(dateStr: string): string {
  return getLocalDateString(addMonths(parseLocalDate(dateStr), 1));
}

export function getPrevMonth(dateStr: string): string {
  return getLocalDateString(subMonths(parseLocalDate(dateStr), 1));
}

/** Check if a date string is today */
export function isDateToday(dateStr: string): boolean {
  return isToday(parseLocalDate(dateStr));
}

/** Format a date string for display */
export function formatDateDisplay(dateStr: string): string {
  return format(parseLocalDate(dateStr), 'EEE, MMM d, yyyy');
}

export function formatMonthYear(dateStr: string): string {
  return format(parseLocalDate(dateStr), 'MMMM yyyy');
}

/** Get all dates in a range (inclusive) */
export function getDateRange(startStr: string, endStr: string): string[] {
  const start = parseLocalDate(startStr);
  const end = parseLocalDate(endStr);
  return eachDayOfInterval({ start, end }).map(d => getLocalDateString(d));
}

/** Get dates for the last N days ending today */
export function getLastNDays(n: number): string[] {
  const today = new Date();
  const start = subDays(today, n - 1);
  return eachDayOfInterval({ start, end: today }).map(d => getLocalDateString(d));
}

/** ISO timestamp for sync — this one IS UTC intentionally (for updated_at comparison) */
export function getNowISO(): string {
  return new Date().toISOString();
}

/** The epoch default for first-ever sync pull */
export const SYNC_EPOCH = '1970-01-01T00:00:00Z';

export { addDays, subDays, startOfMonth, endOfMonth, differenceInDays, startOfDay, isSameDay };
