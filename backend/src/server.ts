import cors from "cors";
import express from "express";
import { google } from "googleapis";
import { DateTime } from "luxon";
import { env } from "./env.js";
import { createAdminToken, requireAdmin } from "./auth.js";
import { prisma } from "./prisma.js";
import {
  adminLoginSchema,
  availabilitySchema,
  bookingSchema,
  calendarAssignSchema,
} from "./validation.js";
import {
  checkSlotStillAvailable,
  fetchBusyIntervals,
  getAvailableSlots,
  getCalendarIds,
  getGoogleCalendarClient,
  resolveCalendarSlots,
} from "./calendar.js";

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/bookings/availability", async (req, res) => {
  const parsed = availabilitySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Validation error" });
  }

  try {
    const slots = resolveCalendarSlots(parsed.data.meetingType, parsed.data.city);
    const calendarIds = await getCalendarIds(slots);
    const calendar = await getGoogleCalendarClient();

    const rangeStart = DateTime.fromISO(parsed.data.date, { zone: "Europe/Warsaw" }).set({
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    });
    const rangeEnd = rangeStart.plus({ days: 1 });

    const busy = await fetchBusyIntervals(
      calendar,
      calendarIds,
      rangeStart.toISO() ?? "",
      rangeEnd.toISO() ?? "",
    );
    const availableSlots = getAvailableSlots(parsed.data.date, busy);

    return res.json({ availableSlots });
  } catch (error) {
    return res.status(500).json({
      message:
        error instanceof Error
          ? error.message
          : "Unable to fetch availability from Google Calendar",
    });
  }
});

app.post("/api/bookings", async (req, res) => {
  const parsed = bookingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Validation error" });
  }

  try {
    const payload = parsed.data;
    const slotKeys = resolveCalendarSlots(payload.meetingType, payload.city);
    const calendarIds = await getCalendarIds(slotKeys);
    const calendar = await getGoogleCalendarClient();

    const stillAvailable = await checkSlotStillAvailable(payload.meetingDateTime, calendarIds, calendar);
    if (!stillAvailable) {
      return res.status(409).json({ message: "Selected slot is no longer available" });
    }

    const start = DateTime.fromISO(payload.meetingDateTime, { zone: "Europe/Warsaw" });
    const end = start.plus({ minutes: 30 });
    const contactParts = [
      payload.telegramUsername?.trim() ? `telegram: ${payload.telegramUsername.trim()}` : null,
      payload.instagramUrl?.trim() ? `instagram: ${payload.instagramUrl.trim()}` : null,
    ].filter(Boolean);

    const event = {
      summary: `${payload.meetingType} - ${payload.fullName}`,
      description: [
        `phone: ${payload.phone}`,
        `email: ${payload.email || "n/a"}`,
        `city: ${payload.city}`,
        `contact: ${contactParts.join(" | ")}`,
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
      calendarIds.map((calendarId) =>
        calendar.events.insert({
          calendarId,
          requestBody: event,
        }),
      ),
    );

    await prisma.booking.create({
      data: {
        fullName: payload.fullName,
        phone: payload.phone,
        email: payload.email || null,
        meetingType: payload.meetingType,
        city: payload.city,
        datetime: start.toJSDate(),
        contact: contactParts.join(" | "),
        calendarsUsed: calendarIds.join(","),
      },
    });

    return res.status(201).json({ message: "Booking created" });
  } catch (error) {
    return res.status(500).json({
      message:
        error instanceof Error ? error.message : "Booking failed due to external calendar error",
    });
  }
});

app.post("/api/admin/login", (req, res) => {
  const parsed = adminLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Password is required" });
  }

  if (parsed.data.password !== env.ADMIN_PASSWORD) {
    return res.status(401).json({ message: "Invalid password" });
  }

  const token = createAdminToken();
  return res.json({ token });
});

app.get("/api/admin/google/auth-url", requireAdmin, (_req, res) => {
  const oauth2 = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );
  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/calendar"],
    prompt: "consent",
  });
  res.json({ url });
});

app.get("/api/admin/google/callback", async (req, res) => {
  const code = req.query.code;
  if (typeof code !== "string") {
    return res.status(400).send("Missing Google authorization code");
  }

  try {
    const oauth2 = new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      env.GOOGLE_REDIRECT_URI,
    );

    const { tokens } = await oauth2.getToken(code);
    if (!tokens.access_token) {
      return res.status(400).send("Google did not return access token");
    }

    await prisma.oAuthToken.create({
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        scope: tokens.scope ?? null,
        tokenType: tokens.token_type ?? null,
        expiryDate: tokens.expiry_date ? BigInt(tokens.expiry_date) : null,
      },
    });

    return res.redirect(`${env.FRONTEND_URL}/admin?google=connected`);
  } catch {
    return res.redirect(`${env.FRONTEND_URL}/admin?google=error`);
  }
});

app.get("/api/admin/calendars", requireAdmin, async (_req, res) => {
  try {
    const calendar = await getGoogleCalendarClient();
    const list = await calendar.calendarList.list();
    const items = (list.data.items ?? []).map((item) => ({
      id: item.id ?? "",
      summary: item.summary ?? item.id ?? "Unnamed",
    }));

    const current = await prisma.calendarConfig.findMany();
    const bySlot = current.reduce<Record<string, string>>((acc, row) => {
      acc[row.slot] = row.calendarId;
      return acc;
    }, {});

    return res.json({
      availableCalendars: items.filter((item) => item.id),
      assigned: {
        calendar1: bySlot.calendar1 ?? "",
        calendar2: bySlot.calendar2 ?? "",
        calendar3: bySlot.calendar3 ?? "",
      },
    });
  } catch {
    return res.status(500).json({ message: "Unable to fetch calendars. Connect Google first." });
  }
});

app.put("/api/admin/calendars", requireAdmin, async (req, res) => {
  const parsed = calendarAssignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "All 3 calendar assignments are required" });
  }

  await prisma.$transaction([
    prisma.calendarConfig.upsert({
      where: { slot: "calendar1" },
      create: { slot: "calendar1", calendarId: parsed.data.calendar1 },
      update: { calendarId: parsed.data.calendar1 },
    }),
    prisma.calendarConfig.upsert({
      where: { slot: "calendar2" },
      create: { slot: "calendar2", calendarId: parsed.data.calendar2 },
      update: { calendarId: parsed.data.calendar2 },
    }),
    prisma.calendarConfig.upsert({
      where: { slot: "calendar3" },
      create: { slot: "calendar3", calendarId: parsed.data.calendar3 },
      update: { calendarId: parsed.data.calendar3 },
    }),
  ]);

  return res.json({ message: "Calendar assignments saved" });
});

app.get("/api/admin/bookings", requireAdmin, async (_req, res) => {
  const bookings = await prisma.booking.findMany({
    orderBy: { datetime: "asc" },
    where: {
      datetime: {
        gte: new Date(),
      },
    },
  });
  res.json({ bookings });
});

app.listen(Number(env.PORT), () => {
  console.log(`Backend running on http://localhost:${env.PORT}`);
});
