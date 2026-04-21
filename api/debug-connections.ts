import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getConnections } from "../lib/storage.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const connections = await getConnections();
    return res.status(200).json({ connections });
  } catch (error) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : "Failed to load connections",
    });
  }
}
