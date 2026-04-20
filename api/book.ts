import type { VercelRequest, VercelResponse } from "@vercel/node";
import { DateTime } from "luxon";
import { z } from "zod";
import { isSlotStillAvailable } from "../lib/availability.js";
import { resolveCalendarSlots } from "../lib/calendarRules.js";
import { getCalendarClient, resolveCalendarIds } from "../lib/google.js";

const latinNameRegex = /^[A-Za-z\s'-]+$/;

const schema = z
  .object({
    fullName: z.string().min(2).max(120).regex(latinNameRegex, "Name must contain latin characters only"),
    phone: z.string().min(5).max(30),
    email: z.string().email().optional().or(z.literal("")),
    meetingType: z.enum(["mortgage", "consultation"]),
    city: z.enum(["wroclaw", "warsaw", "other"]),
    datetime: z
      .string()
      .refine(
        (value) => DateTime.fromISO(value, { zone: "Europe/Warsaw" }).isValid,
        "Invalid datetime",
      ),
    contact: z.object({
      telegramUsername: z.string().optional().or(z.literal("")),
      instagramUrl: z.string().url().optional().or(z.literal("")),
    }),
  })
  .superRefine((payload, ctx) => {
    const hasTelegram = Boolean(payload.contact.telegramUsername?.trim());
    const hasInstagram = Boolean(payload.contact.instagramUrl?.trim());
    if (!hasTelegram && !hasInstagram) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide telegram username or instagram URL",
        path: ["contact", "telegramUsername"],
      });
    }
  });

function normalizeBody(body: unknown) {
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as unknown;
    } catch {
      return {};
    }
  }
  return body;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const parsed = schema.safeParse(normalizeBody(req.body));
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid input" });
  }

  try {
    const payload = parsed.data;
    const slotKeys = resolveCalendarSlots(payload.meetingType, payload.city);
    const calendarIds = await resolveCalendarIds(slotKeys);
    const calendar = await getCalendarClient();

    const isAvailable = await isSlotStillAvailable(payload.datetime, calendarIds, calendar);
    if (!isAvailable) {
      return res.status(409).json({ message: "Selected slot is no longer available" });
    }

    const start = DateTime.fromISO(payload.datetime, { zone: "Europe/Warsaw" });
    const end = start.plus({ minutes: 30 });

    const contactLines = [
      payload.contact.telegramUsername?.trim()
        ? `telegram: ${payload.contact.telegramUsername.trim()}`
        : null,
      payload.contact.instagramUrl?.trim() ? `instagram: ${payload.contact.instagramUrl.trim()}` : null,
    ].filter(Boolean);

    const event = {
      summary: `${payload.meetingType} - ${payload.fullName}`,
      description: [
        `phone: ${payload.phone}`,
        `email: ${payload.email || "n/a"}`,
        `city: ${payload.city}`,
        `contact: ${contactLines.join(" | ")}`,
      ].join("\n"),
      start: {
        dateTime: start.toISO(),
        timeZone: "Europe/Warsaw",
      },
      end: {
        dateTime: end.toISO(),
        timeZone: "Europe/Warsaw",
      },
    };

    await Promise.all(
      calendarIds.map((calendarId: string) =>
        calendar.events.insert({
          calendarId,
          requestBody: event,
        }),
      ),
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : "Booking failed due to Google API error",
    });
  }
}
