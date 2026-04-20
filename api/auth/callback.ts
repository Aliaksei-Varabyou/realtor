import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { connectRoleByAuthCode, parseRoleFromState } from "../../lib/google.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const code = req.query.code;
  const state = req.query.state;
  if (typeof code !== "string" || typeof state !== "string") {
    return res.status(400).send("Missing Google authorization code or state");
  }

  try {
    const role = parseRoleFromState(state);
    await connectRoleByAuthCode(role, code);
    const appUrl = process.env.APP_URL ?? "";
    if (appUrl) {
      return res.redirect(`${appUrl}/admin?google=connected&role=${encodeURIComponent(role)}`);
    }
    return res.status(200).send("Google account connected successfully.");
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).send("Invalid OAuth state");
    }
    const appUrl = process.env.APP_URL ?? "";
    if (appUrl) {
      return res.redirect(`${appUrl}/admin?google=error`);
    }
    return res.status(500).send("Failed to connect Google.");
  }
}
