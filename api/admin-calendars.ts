import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  assertAdminPassword,
  getConnectionStatuses,
  getAdminPasswordFromRequestHeaders,
} from "../lib/google.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const adminPassword = getAdminPasswordFromRequestHeaders(req.headers);
    assertAdminPassword(adminPassword);
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (req.method === "GET") {
    try {
      const connections = await getConnectionStatuses();

      return res.status(200).json({
        connections,
      });
    } catch (error) {
      return res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to fetch calendars",
      });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}
