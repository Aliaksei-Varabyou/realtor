import type { VercelRequest, VercelResponse } from "@vercel/node";
import { DateTime } from "luxon";
import { z } from "zod";
import { getAvailableSlots, fetchBusyIntervals } from "../lib/availability.js";
import { resolveCalendarSlots } from "../lib/calendarRules.js";
import { getCalendarClient, resolveCalendarIds } from "../lib/google.js";

const schema = z.object({
  meetingType: z.enum(["mortgage", "consultation"]),
  city: z.enum(["wroclaw", "warsaw", "other"]),
  date: z.string().refine(
    (value) => DateTime.fromISO(value, { zone: "Europe/Warsaw" }).isValid,
    "Invalid date",
  ),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const parsed = schema.safeParse({
    meetingType: req.query.meetingType,
    city: req.query.city,
    date: req.query.date,
  });
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid input" });
  }

  try {
    const selectedSlots = resolveCalendarSlots(parsed.data.meetingType, parsed.data.city);
    const calendarIds = await resolveCalendarIds(selectedSlots);
    const calendar = await getCalendarClient();

    const rangeStart = DateTime.fromISO(parsed.data.date, { zone: "Europe/Warsaw" }).startOf("day");
    const rangeEnd = rangeStart.plus({ days: 1 });

    const busyIntervals = await fetchBusyIntervals(
      calendar,
      calendarIds,
      rangeStart.toISO() ?? "",
      rangeEnd.toISO() ?? "",
    );
    const availableSlots = getAvailableSlots(parsed.data.date, busyIntervals);
    return res.status(200).json({ availableSlots });
  } catch (error) {
    return res
      .status(500)
      .json({ message: error instanceof Error ? error.message : "Availability check failed" });
  }
}
