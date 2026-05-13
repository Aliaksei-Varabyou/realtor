import type { VercelRequest, VercelResponse } from "@vercel/node";
import { google } from "googleapis";
import { DateTime } from "luxon";
import { z } from "zod";
import { isSlotStillAvailable } from "../lib/availability.js";
import { resolveCalendarSlots } from "../lib/calendarRules.js";
import { sendBookingEmails } from "../lib/email.js";
import { getConnectionsByRoles, getOAuthClient, markRoleDisconnected } from "../lib/google.js";
import { getAdminSettings } from "../lib/storage.js";

const latinNameRegex = /^[A-Za-z\s'-]+$/;

const schema = z
  .object({
    fullName: z.string().min(2).max(120).regex(latinNameRegex, "Name must contain latin characters only"),
    phone: z.string().min(5).max(30),
    email: z.string().email(),
    meetingType: z.enum(["mortgage", "consultation"]),
    city: z.enum(["wroclaw", "warsaw", "other"]),
    meetingFormat: z.enum(["online", "offline"]),
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
    const adminSettings = await getAdminSettings();
    const roles = resolveCalendarSlots(payload.meetingType, payload.city);
    const connections = await getConnectionsByRoles(roles);
    const clients = connections.map((connection) => ({
      connection,
      calendar: google.calendar({
        version: "v3",
        auth: getOAuthClient(connection.refreshToken),
      }),
    }));

    const availabilityChecks = await Promise.all(
      clients.map(async ({ connection, calendar }) => {
        try {
          return await isSlotStillAvailable(payload.datetime, [connection.calendarId], calendar);
        } catch (error) {
          const status = (error as { code?: number }).code;
          if (status === 401) {
            await markRoleDisconnected(connection.role);
          }
          throw error;
        }
      }),
    );
    const isAvailable = availabilityChecks.every(Boolean);
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
    const meetingFormatLabel = payload.meetingFormat === "online" ? "Онлайн" : "Офлайн";

    const event = {
      summary: `${payload.meetingType} - ${payload.fullName}`,
      description: [
        `phone: ${payload.phone}`,
        `email: ${payload.email}`,
        `city: ${payload.city}`,
        `meeting format: ${meetingFormatLabel}`,
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
      clients.map(async ({ connection, calendar }) => {
        try {
          await calendar.events.insert({
            calendarId: connection.calendarId,
            requestBody: event,
          });
        } catch (error) {
          const status = (error as { code?: number }).code;
          if (status === 401) {
            await markRoleDisconnected(connection.role);
          }
          throw error;
        }
      }),
    );

    await sendBookingEmails(adminSettings, {
      fullName: payload.fullName,
      clientEmail: payload.email,
      meetingType: payload.meetingType,
      city: payload.city,
      meetingFormat: payload.meetingFormat,
      datetime: payload.datetime,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : "Booking failed due to Google API error",
    });
  }
}
