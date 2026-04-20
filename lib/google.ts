import { kv } from "@vercel/kv";
import { google } from "googleapis";
import type { CalendarSlot } from "./calendarRules.js";

const STORE_KEY = "realtor:mvp:config";
const SCOPES = ["https://www.googleapis.com/auth/calendar"];

type StoredConfig = {
  refreshToken: string | null;
  calendars: Record<CalendarSlot, string>;
};

declare global {
  // Keep local-dev fallback simple when KV is not configured.
  // eslint-disable-next-line no-var
  var __REALTOR_MVP_STORE__: StoredConfig | undefined;
}

function parseCalendarEnv() {
  try {
    const raw = process.env.GOOGLE_CALENDARS_JSON;
    if (!raw) {
      return { calendar1: "", calendar2: "", calendar3: "" };
    }
    const parsed = JSON.parse(raw) as Partial<Record<CalendarSlot, string>>;
    return {
      calendar1: parsed.calendar1 ?? "",
      calendar2: parsed.calendar2 ?? "",
      calendar3: parsed.calendar3 ?? "",
    };
  } catch {
    return { calendar1: "", calendar2: "", calendar3: "" };
  }
}

function getFallbackStore() {
  if (!globalThis.__REALTOR_MVP_STORE__) {
    globalThis.__REALTOR_MVP_STORE__ = {
      refreshToken: process.env.GOOGLE_REFRESH_TOKEN ?? null,
      calendars: parseCalendarEnv(),
    };
  }
  return globalThis.__REALTOR_MVP_STORE__;
}

function hasKvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function getStoredConfig(): Promise<StoredConfig> {
  if (hasKvConfigured()) {
    const value = await kv.get<StoredConfig>(STORE_KEY);
    if (value) {
      return value;
    }
  }
  return getFallbackStore();
}

async function setStoredConfig(next: StoredConfig) {
  if (hasKvConfigured()) {
    await kv.set(STORE_KEY, next);
  }
  globalThis.__REALTOR_MVP_STORE__ = next;
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

function getOAuthClient() {
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

export function createGoogleAuthUrl() {
  const oauth2 = getOAuthClient();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const oauth2 = getOAuthClient();
  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) {
    const current = await getStoredConfig();
    if (!current.refreshToken) {
      throw new Error("Google did not return refresh token. Reconnect with consent.");
    }
    return;
  }

  const current = await getStoredConfig();
  await setStoredConfig({
    ...current,
    refreshToken: tokens.refresh_token,
  });
}

export async function getCalendarClient() {
  const config = await getStoredConfig();
  if (!config.refreshToken) {
    throw new Error("Google account is not connected");
  }

  const oauth2 = getOAuthClient();
  oauth2.setCredentials({
    refresh_token: config.refreshToken,
  });

  return google.calendar({ version: "v3", auth: oauth2 });
}

export async function getCalendarAssignments() {
  const config = await getStoredConfig();
  return config.calendars;
}

export async function setCalendarAssignments(calendars: Record<CalendarSlot, string>) {
  const current = await getStoredConfig();
  await setStoredConfig({
    ...current,
    calendars,
  });
}

export async function resolveCalendarIds(slots: CalendarSlot[]) {
  const assignments = await getCalendarAssignments();
  const ids = slots.map((slot) => assignments[slot]).filter(Boolean);
  if (ids.length !== slots.length) {
    throw new Error("Google calendars are not fully assigned");
  }
  return ids;
}
