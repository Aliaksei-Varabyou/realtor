import type { VercelRequest, VercelResponse } from "@vercel/node";
import { exchangeCodeForTokens } from "../../lib/google.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const code = req.query.code;
  if (typeof code !== "string") {
    return res.status(400).send("Missing Google authorization code");
  }

  try {
    await exchangeCodeForTokens(code);
    const appUrl = process.env.APP_URL ?? "";
    if (appUrl) {
      return res.redirect(`${appUrl}/admin?google=connected`);
    }
    return res.status(200).send("Google connected successfully.");
  } catch {
    const appUrl = process.env.APP_URL ?? "";
    if (appUrl) {
      return res.redirect(`${appUrl}/admin?google=error`);
    }
    return res.status(500).send("Failed to connect Google.");
  }
}
