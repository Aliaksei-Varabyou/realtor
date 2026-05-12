import type { CalendarSlot } from "./calendarRules.js";
import { redis } from "./redis.js";

export type CalendarConnection = {
  role: CalendarSlot;
  email: string;
  refreshToken: string;
  calendarId: string;
};

export type AdminSettings = {
  email1: string;
  email2: string;
  mortgageOnlineText: string;
  mortgageOfflineText: string;
  consultationPurchaseSaleText: string;
  mortgageOnlineWarsawText: string;
  mortgageOfflineWarsawText: string;
};

export const defaultAdminSettings: AdminSettings = {
  email1: "",
  email2: "",
  mortgageOnlineText: "",
  mortgageOfflineText: "",
  consultationPurchaseSaleText: "",
  mortgageOnlineWarsawText: "",
  mortgageOfflineWarsawText: "",
};

const CONNECTIONS_STORE_KEY = "calendar_connections";
const ADMIN_SETTINGS_STORE_KEY = "admin_settings";

export async function getConnections(): Promise<CalendarConnection[]> {
  const raw = await redis.get(CONNECTIONS_STORE_KEY);
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
  await redis.set(CONNECTIONS_STORE_KEY, JSON.stringify(next));
}

export async function clearConnection(role: CalendarSlot) {
  const current = await getConnections();
  const next = current.filter((connection) => connection.role !== role);
  await redis.set(CONNECTIONS_STORE_KEY, JSON.stringify(next));
}

export async function getAdminSettings(): Promise<AdminSettings> {
  const raw = await redis.get(ADMIN_SETTINGS_STORE_KEY);
  if (!raw) return defaultAdminSettings;

  try {
    const parsed = JSON.parse(raw) as Partial<AdminSettings>;
    return {
      ...defaultAdminSettings,
      ...parsed,
    };
  } catch {
    return defaultAdminSettings;
  }
}

export async function saveAdminSettings(settings: AdminSettings) {
  await redis.set(ADMIN_SETTINGS_STORE_KEY, JSON.stringify(settings));
}
