import type { CalendarSlot } from "./calendarRules.js";
import { redis } from "./redis.js";

export type CalendarConnection = {
  role: CalendarSlot;
  email: string;
  refreshToken: string;
  calendarId: string;
};

const STORE_KEY = "calendar_connections";

export async function getConnections(): Promise<CalendarConnection[]> {
  const raw = await redis.get(STORE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as CalendarConnection[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getConnectionByRole(role: CalendarSlot) {
  const connections = await getConnections();
  return connections.find((connection) => connection.role === role) ?? null;
}

export async function saveConnection(connection: CalendarConnection) {
  const current = await getConnections();
  const next = current.filter((item) => item.role !== connection.role);
  next.push(connection);
  await redis.set(STORE_KEY, JSON.stringify(next));
}

export async function clearConnection(role: CalendarSlot) {
  const current = await getConnections();
  const next = current.filter((connection) => connection.role !== role);
  await redis.set(STORE_KEY, JSON.stringify(next));
}
