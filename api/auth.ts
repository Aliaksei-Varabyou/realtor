import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  assertAdminPassword,
  createGoogleAuthUrl,
  getAdminPasswordFromRequestHeaders,
} from "../lib/google.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const adminPassword = getAdminPasswordFromRequestHeaders(req.headers);
    assertAdminPassword(adminPassword);

    const url = createGoogleAuthUrl();
    return res.status(200).json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : 500;
    return res.status(status).json({ message });
  }
}
