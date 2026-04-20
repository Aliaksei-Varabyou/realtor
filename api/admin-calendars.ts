import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import {
  assertAdminPassword,
  getAdminPasswordFromRequestHeaders,
  getCalendarAssignments,
  getCalendarClient,
  setCalendarAssignments,
} from "../lib/google.js";

const assignmentSchema = z.object({
  calendar1: z.string().min(1),
  calendar2: z.string().min(1),
  calendar3: z.string().min(1),
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
      const calendar = await getCalendarClient();
      const list = await calendar.calendarList.list();
      const availableCalendars = (list.data.items ?? [])
        .map((item: { id?: string | null; summary?: string | null }) => ({
          id: item.id ?? "",
          summary: item.summary ?? item.id ?? "Unnamed",
        }))
        .filter((item: { id: string }) => item.id);
      const assigned = await getCalendarAssignments();

      return res.status(200).json({
        availableCalendars,
        assigned,
      });
    } catch (error) {
      return res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to fetch calendars",
      });
    }
  }

  if (req.method === "PUT") {
    const parsed = assignmentSchema.safeParse(normalizeBody(req.body));
    if (!parsed.success) {
      return res.status(400).json({ message: "All calendar assignments are required" });
    }

    await setCalendarAssignments(parsed.data);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ message: "Method not allowed" });
}
