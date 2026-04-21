import { google } from "googleapis";
import { z } from "zod";
import type { CalendarSlot } from "./calendarRules.js";
import { clearConnection, getConnections, saveConnection } from "./storage.js";

const SCOPES = ["https://www.googleapis.com/auth/calendar"];
const roleSchema = z.enum(["calendar1", "calendar2", "calendar3"]);

function createOAuthBaseClient() {
  if (
    !process.env.GOOGLE_CLIENT_ID ||
    !process.env.GOOGLE_CLIENT_SECRET ||
    !process.env.GOOGLE_REDIRECT_URI
  ) {
    throw new Error("Missing Google OAuth env configuration");
  }

  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

export function assertAdminPassword(adminPassword: string | null) {
  if (!process.env.ADMIN_PASSWORD) {
    throw new Error("Missing ADMIN_PASSWORD");
  }
  if (!adminPassword || adminPassword !== process.env.ADMIN_PASSWORD) {
    throw new Error("Unauthorized");
  }
}

export function getAdminPasswordFromRequestHeaders(headers: Record<string, string | string[] | undefined>) {
  const value = headers["x-admin-password"];
  return Array.isArray(value) ? value[0] : value ?? null;
}

export function parseRole(value: unknown): CalendarSlot {
  return roleSchema.parse(value);
}

function encodeState(role: CalendarSlot) {
  return Buffer.from(JSON.stringify({ role }), "utf-8").toString("base64url");
}

export function parseRoleFromState(state: string): CalendarSlot {
  const decoded = Buffer.from(state, "base64url").toString("utf-8");
  const parsed = JSON.parse(decoded) as { role?: unknown };
  return parseRole(parsed.role);
}

export function createGoogleAuthUrl(role: CalendarSlot) {
  const oauth2 = createOAuthBaseClient();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state: encodeState(role),
  });
}

export async function connectRoleByAuthCode(role: CalendarSlot, code: string) {
  const oauth2 = createOAuthBaseClient();
  const { tokens } = await oauth2.getToken(code);
  console.log("Google OAuth tokens:", tokens);

  const refreshToken = tokens.refresh_token;
  const accessToken = tokens.access_token;
  if (!refreshToken || !accessToken) {
    throw new Error("Google did not return required tokens. Reconnect with consent.");
  }

  oauth2.setCredentials({
    refresh_token: refreshToken,
    access_token: accessToken,
  });

  const calendar = google.calendar({ version: "v3", auth: oauth2 });
  const calendarList = await calendar.calendarList.list();
  const primary =
    (calendarList.data.items ?? []).find((item) => item.primary) ??
    (calendarList.data.items ?? []).find((item) => item.id?.includes("@"));

  if (!primary?.id) {
    throw new Error("Unable to resolve primary calendar");
  }

  await saveConnection({
    role,
    email: primary.id,
    refreshToken,
    calendarId: primary.id,
  });
}

export function getOAuthClient(refreshToken: string) {
  const oauth2 = createOAuthBaseClient();
  oauth2.setCredentials({
    refresh_token: refreshToken,
  });
  return oauth2;
}

export async function getConnectionStatuses() {
  const all = await getConnections();
  return {
    calendar1: all.calendar1
      ? {
          role: all.calendar1.role,
          email: all.calendar1.email,
          calendarId: all.calendar1.calendarId,
        }
      : null,
    calendar2: all.calendar2
      ? {
          role: all.calendar2.role,
          email: all.calendar2.email,
          calendarId: all.calendar2.calendarId,
        }
      : null,
    calendar3: all.calendar3
      ? {
          role: all.calendar3.role,
          email: all.calendar3.email,
          calendarId: all.calendar3.calendarId,
        }
      : null,
  };
}

export async function getConnectionsByRoles(roles: CalendarSlot[]) {
  const all = await getConnections();
  const result = roles
    .map((role) => all[role])
    .filter(Boolean)
    .map((entry) => entry!);

  if (result.length !== roles.length) {
    throw new Error("Some required calendars are not connected");
  }
  return result;
}

export async function markRoleDisconnected(role: CalendarSlot) {
  await clearConnection(role);
}
