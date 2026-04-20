import { kv } from "@vercel/kv";
import type { CalendarSlot } from "./calendarRules.js";

export type CalendarConnection = {
  role: CalendarSlot;
  email: string;
  refreshToken: string;
  calendarId: string;
};

type ConnectionMap = Partial<Record<CalendarSlot, CalendarConnection>>;

const STORE_KEY = "realtor:mvp:calendar-connections";

declare global {
  // Local fallback for dev when KV is not configured.
  // eslint-disable-next-line no-var
  var __REALTOR_CONNECTIONS__: ConnectionMap | undefined;
}

function hasKvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function parseEnvConnections(): ConnectionMap {
  try {
    const raw = process.env.GOOGLE_CONNECTIONS_JSON;
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ConnectionMap;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function getFallbackConnections(): ConnectionMap {
  if (!globalThis.__REALTOR_CONNECTIONS__) {
    globalThis.__REALTOR_CONNECTIONS__ = parseEnvConnections();
  }
  return globalThis.__REALTOR_CONNECTIONS__;
}

export async function getAllConnections(): Promise<ConnectionMap> {
  if (hasKvConfigured()) {
    const value = await kv.get<ConnectionMap>(STORE_KEY);
    if (value) return value;
  }
  return getFallbackConnections();
}

export async function saveConnection(connection: CalendarConnection) {
  const current = await getAllConnections();
  const next: ConnectionMap = {
    ...current,
    [connection.role]: connection,
  };

  if (hasKvConfigured()) {
    await kv.set(STORE_KEY, next);
  }
  globalThis.__REALTOR_CONNECTIONS__ = next;
}

export async function clearConnection(role: CalendarSlot) {
  const current = await getAllConnections();
  const next: ConnectionMap = { ...current };
  delete next[role];

  if (hasKvConfigured()) {
    await kv.set(STORE_KEY, next);
  }
  globalThis.__REALTOR_CONNECTIONS__ = next;
}
