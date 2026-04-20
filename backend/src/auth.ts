import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "./env.js";

export type AdminTokenPayload = { role: "admin" };

export function createAdminToken() {
  return jwt.sign({ role: "admin" } satisfies AdminTokenPayload, env.ADMIN_JWT_SECRET, {
    expiresIn: "8h",
  });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, env.ADMIN_JWT_SECRET) as AdminTokenPayload;
    if (payload.role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}
