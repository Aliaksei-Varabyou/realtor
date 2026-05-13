import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import {
  assertAdminPassword,
  getConnectionStatuses,
  getAdminPasswordFromRequestHeaders,
} from "../lib/google.js";
import { getAdminSettings, saveAdminSettings } from "../lib/storage.js";

const settingsSchema = z.object({
  email1: z.string().email().or(z.literal("")),
  email2: z.string().email().or(z.literal("")),
  email3: z.string().email().or(z.literal("")),
  mortgageOnlineSubject: z.string().max(500),
  mortgageOnlineText: z.string().max(5000),
  mortgageOfflineSubject: z.string().max(500),
  mortgageOfflineText: z.string().max(5000),
  consultationPurchaseSaleSubject: z.string().max(500),
  consultationPurchaseSaleText: z.string().max(5000),
  mortgageOnlineWarsawSubject: z.string().max(500),
  mortgageOnlineWarsawText: z.string().max(5000),
  mortgageOfflineWarsawSubject: z.string().max(500),
  mortgageOfflineWarsawText: z.string().max(5000),
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
  try {
    const adminPassword = getAdminPasswordFromRequestHeaders(req.headers);
    assertAdminPassword(adminPassword);
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (req.method === "GET") {
    try {
      const [connections, settings] = await Promise.all([
        getConnectionStatuses(),
        getAdminSettings(),
      ]);

      return res.status(200).json({
        connections,
        settings,
      });
    } catch (error) {
      return res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to fetch calendars",
      });
    }
  }

  if (req.method === "POST") {
    const parsed = settingsSchema.safeParse(normalizeBody(req.body));
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid input" });
    }

    try {
      await saveAdminSettings(parsed.data);
      return res.status(200).json({ settings: parsed.data });
    } catch (error) {
      return res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to save settings",
      });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}
