import { kv } from "@vercel/kv";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { CalendarSlot } from "./calendarRules.js";

export type CalendarConnection = {
  role: CalendarSlot;
  email: string;
  refreshToken: string;
  calendarId: string;
};

type ConnectionMap = Partial<Record<CalendarSlot, CalendarConnection>>;

const STORE_KEY = "realtor:mvp:calendar-connections";
const FILE_STORE_PATH = process.env.VERCEL
  ? "/tmp/realtor-calendar-connections.json"
  : path.join(process.cwd(), ".data", "calendar-connections.json");

declare global {
  // In-memory fallback for process lifetime.
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

async function readConnectionsFromFile(): Promise<ConnectionMap> {
  try {
    const content = await fs.readFile(FILE_STORE_PATH, "utf-8");
    const parsed = JSON.parse(content) as ConnectionMap;
    return parsed ?? {};
  } catch {
    return {};
  }
}

async function writeConnectionsToFile(connections: ConnectionMap) {
  try {
    await fs.mkdir(path.dirname(FILE_STORE_PATH), { recursive: true });
    await fs.writeFile(FILE_STORE_PATH, JSON.stringify(connections, null, 2), "utf-8");
  } catch {
    // Non-fatal fallback for restricted environments.
  }
}

function getInMemoryConnections(): ConnectionMap {
  if (!globalThis.__REALTOR_CONNECTIONS__) {
    globalThis.__REALTOR_CONNECTIONS__ = parseEnvConnections();
  }
  return globalThis.__REALTOR_CONNECTIONS__;
}

export async function getConnections(): Promise<ConnectionMap> {
  if (hasKvConfigured()) {
    const value = await kv.get<ConnectionMap>(STORE_KEY);
    if (value) return value;
  }

  const fileConnections = await readConnectionsFromFile();
  if (Object.keys(fileConnections).length > 0) {
    globalThis.__REALTOR_CONNECTIONS__ = fileConnections;
    return fileConnections;
  }
  return getInMemoryConnections();
}

export async function getConnectionByRole(role: CalendarSlot) {
  const connections = await getConnections();
  return connections[role] ?? null;
}

export async function saveConnection(connection: CalendarConnection) {
  const current = await getConnections();
  const next: ConnectionMap = {
    ...current,
    [connection.role]: connection,
  };

  if (hasKvConfigured()) {
    await kv.set(STORE_KEY, next);
  }
  await writeConnectionsToFile(next);
  globalThis.__REALTOR_CONNECTIONS__ = next;
}

export async function clearConnection(role: CalendarSlot) {
  const current = await getConnections();
  const next: ConnectionMap = { ...current };
  delete next[role];

  if (hasKvConfigured()) {
    await kv.set(STORE_KEY, next);
  }
  await writeConnectionsToFile(next);
  globalThis.__REALTOR_CONNECTIONS__ = next;
}
