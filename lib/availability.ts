import { DateTime, Interval } from "luxon";
import type { calendar_v3 } from "googleapis";

const SLOT_MINUTES = 30;
const BUFFER_MINUTES = 15;
const TZ = "Europe/Warsaw";

function mergeIntervals(intervals: Interval[]) {
  if (intervals.length === 0) return [];
  const sorted = intervals
    .filter((entry) => entry.isValid)
    .sort(
      (a, b) =>
        (a.start?.toMillis() ?? Number.NEGATIVE_INFINITY) -
        (b.start?.toMillis() ?? Number.NEGATIVE_INFINITY),
    );

  const merged: Interval[] = [sorted[0]];
  for (const current of sorted.slice(1)) {
    const prev = merged[merged.length - 1];
    if (prev.overlaps(current) || prev.abutsStart(current)) {
      merged[merged.length - 1] = prev.union(current);
    } else {
      merged.push(current);
    }
  }
  return merged;
}

export async function fetchBusyIntervals(
  calendar: calendar_v3.Calendar,
  calendarIds: string[],
  rangeStartISO: string,
  rangeEndISO: string,
) {
  const freeBusy = await calendar.freebusy.query({
    requestBody: {
      timeMin: rangeStartISO,
      timeMax: rangeEndISO,
      timeZone: TZ,
      items: calendarIds.map((id) => ({ id })),
    },
  });

  const busyIntervals: Interval[] = [];
  for (const calendarId of Object.keys(freeBusy.data.calendars ?? {})) {
    const periods = freeBusy.data.calendars?.[calendarId]?.busy ?? [];
    for (const period of periods) {
      if (!period.start || !period.end) continue;
      const start = DateTime.fromISO(period.start, { zone: TZ }).minus({
        minutes: BUFFER_MINUTES,
      });
      const end = DateTime.fromISO(period.end, { zone: TZ }).plus({
        minutes: BUFFER_MINUTES,
      });

      if (start.isValid && end.isValid && end > start) {
        busyIntervals.push(Interval.fromDateTimes(start, end));
      }
    }
  }

  return mergeIntervals(busyIntervals);
}

export function getAvailableSlots(dayISO: string, busyIntervals: Interval[]) {
  const dayStart = DateTime.fromISO(dayISO, { zone: TZ }).set({
    hour: 9,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
  const dayEnd = DateTime.fromISO(dayISO, { zone: TZ }).set({
    hour: 18,
    minute: 0,
    second: 0,
    millisecond: 0,
  });

  const now = DateTime.now().setZone(TZ);
  const result: string[] = [];
  let cursor = dayStart;

  while (cursor.plus({ minutes: SLOT_MINUTES }) <= dayEnd) {
    const slotStart = cursor;
    const slotEnd = cursor.plus({ minutes: SLOT_MINUTES });
    const slotInterval = Interval.fromDateTimes(slotStart, slotEnd);

    const collides = busyIntervals.some((busy) => busy.overlaps(slotInterval));
    const inPast = slotStart <= now;

    if (!collides && !inPast) {
      result.push(slotStart.toISO() ?? "");
    }
    cursor = cursor.plus({ minutes: SLOT_MINUTES });
  }

  return result.filter(Boolean);
}

export async function isSlotStillAvailable(
  meetingDateTime: string,
  calendarIds: string[],
  calendar: calendar_v3.Calendar,
) {
  const start = DateTime.fromISO(meetingDateTime, { zone: TZ });
  if (!start.isValid) return false;
  const day = start.toISODate();
  if (!day) return false;

  const rangeStart = DateTime.fromISO(day, { zone: TZ }).startOf("day");
  const rangeEnd = rangeStart.plus({ days: 1 });
  const busyIntervals = await fetchBusyIntervals(
    calendar,
    calendarIds,
    rangeStart.toISO() ?? "",
    rangeEnd.toISO() ?? "",
  );

  const requestedInterval = Interval.fromDateTimes(start, start.plus({ minutes: SLOT_MINUTES }));
  return !busyIntervals.some((busy) => busy.overlaps(requestedInterval));
}
