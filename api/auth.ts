import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { createGoogleAuthUrl, parseRole } from "../lib/google.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const role = parseRole(Array.isArray(req.query.role) ? req.query.role[0] : req.query.role);
    const url = createGoogleAuthUrl(role);
    return res.redirect(url);
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "Invalid role parameter"
        : error instanceof Error
          ? error.message
          : "Unauthorized";
    const status = message === "Invalid role parameter" ? 400 : 500;
    return res.status(status).json({ message });
  }
}
