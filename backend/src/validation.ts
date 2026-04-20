import { DateTime } from "luxon";
import { z } from "zod";

const latinNameRegex = /^[A-Za-z\s'-]+$/;

export const availabilitySchema = z.object({
  meetingType: z.enum(["mortgage", "consultation"]),
  city: z.enum(["wroclaw", "warsaw", "other"]),
  date: z.string().refine(
    (value) => DateTime.fromISO(value, { zone: "Europe/Warsaw" }).isValid,
    "Invalid date",
  ),
});

export const bookingSchema = z
  .object({
    fullName: z
      .string()
      .min(2)
      .max(120)
      .regex(latinNameRegex, "Name must contain latin characters only"),
    phone: z.string().min(5).max(30),
    email: z.string().email().optional().or(z.literal("")),
    meetingType: z.enum(["mortgage", "consultation"]),
    city: z.enum(["wroclaw", "warsaw", "other"]),
    meetingDateTime: z
      .string()
      .refine(
        (value) => DateTime.fromISO(value, { zone: "Europe/Warsaw" }).isValid,
        "Invalid datetime",
      ),
    telegramUsername: z.string().optional().or(z.literal("")),
    instagramUrl: z.string().url().optional().or(z.literal("")),
  })
  .superRefine((payload, ctx) => {
    const hasTelegram = Boolean(payload.telegramUsername?.trim());
    const hasInstagram = Boolean(payload.instagramUrl?.trim());

    if (!hasTelegram && !hasInstagram) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide telegram username or instagram url",
        path: ["telegramUsername"],
      });
    }
  });

export const adminLoginSchema = z.object({
  password: z.string().min(1),
});

export const calendarAssignSchema = z.object({
  calendar1: z.string().min(1),
  calendar2: z.string().min(1),
  calendar3: z.string().min(1),
});
