import { calendar_v3, google } from "googleapis";
import { DateTime, Interval } from "luxon";
import { prisma } from "./prisma.js";
import type { CalendarSlot, City, MeetingType } from "./types.js";
import { env } from "./env.js";

const SLOT_MINUTES = 30;
const BUFFER_MINUTES = 15;
const TZ = "Europe/Warsaw";

export function resolveCalendarSlots(meetingType: MeetingType, city: City): CalendarSlot[] {
  if (meetingType === "consultation" || city === "other") return ["calendar1"];
  if (meetingType === "mortgage" && city === "wroclaw") return ["calendar1", "calendar2"];
  return ["calendar1", "calendar3"];
}

export async function getCalendarIds(slots: CalendarSlot[]) {
  const configs = await prisma.calendarConfig.findMany({
    where: { slot: { in: slots } },
  });

  const map = new Map(configs.map((row) => [row.slot, row.calendarId]));
  const ids = slots.map((slot) => map.get(slot)).filter(Boolean) as string[];
  if (ids.length !== slots.length) {
    throw new Error("Google calendars are not fully configured");
  }
  return ids;
}

export async function getGoogleCalendarClient() {
  const token = await prisma.oAuthToken.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  if (!token) {
    throw new Error("Google account is not connected");
  }

  const oauth2 = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );

  oauth2.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken ?? undefined,
    scope: token.scope ?? undefined,
    token_type: token.tokenType ?? undefined,
    expiry_date: token.expiryDate ? Number(token.expiryDate) : undefined,
  });

  oauth2.on("tokens", async (tokens) => {
    await prisma.oAuthToken.create({
      data: {
        accessToken: tokens.access_token ?? token.accessToken,
        refreshToken: tokens.refresh_token ?? token.refreshToken,
        scope: tokens.scope ?? token.scope,
        tokenType: tokens.token_type ?? token.tokenType,
        expiryDate: tokens.expiry_date ? BigInt(tokens.expiry_date) : token.expiryDate,
      },
    });
  });

  return google.calendar({ version: "v3", auth: oauth2 });
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
  for (const calId of Object.keys(freeBusy.data.calendars ?? {})) {
    const periods = freeBusy.data.calendars?.[calId]?.busy ?? [];
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

function mergeIntervals(intervals: Interval[]) {
  if (intervals.length === 0) return [];
  const sorted = intervals
    .filter((i) => i.isValid)
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

export function getAvailableSlots(dayISO: string, busy: Interval[]) {
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
  const slots: string[] = [];
  let cursor = dayStart;

  while (cursor.plus({ minutes: SLOT_MINUTES }) <= dayEnd) {
    const slotStart = cursor;
    const slotEnd = cursor.plus({ minutes: SLOT_MINUTES });

    const isPast = slotStart <= now;
    const collides = busy.some((interval) => interval.overlaps(Interval.fromDateTimes(slotStart, slotEnd)));
    if (!isPast && !collides) {
      slots.push(slotStart.toISO() ?? "");
    }
    cursor = cursor.plus({ minutes: SLOT_MINUTES });
  }

  return slots.filter(Boolean);
}

export async function checkSlotStillAvailable(
  meetingDateTime: string,
  calendarIds: string[],
  calendar: calendar_v3.Calendar,
) {
  const start = DateTime.fromISO(meetingDateTime, { zone: TZ });
  const day = start.toISODate();
  if (!start.isValid || !day) return false;

  const rangeStart = DateTime.fromISO(day, { zone: TZ }).set({ hour: 0, minute: 0 });
  const rangeEnd = rangeStart.plus({ days: 1 });
  const busy = await fetchBusyIntervals(calendar, calendarIds, rangeStart.toISO()!, rangeEnd.toISO()!);

  const slotInterval = Interval.fromDateTimes(start, start.plus({ minutes: SLOT_MINUTES }));
  return !busy.some((interval) => interval.overlaps(slotInterval));
}
