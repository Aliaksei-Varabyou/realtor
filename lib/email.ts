import nodemailer from "nodemailer";
import { DateTime } from "luxon";
import type { AdminSettings } from "./storage.js";

type MeetingType = "mortgage" | "consultation";
type City = "wroclaw" | "warsaw" | "other";
type MeetingFormat = "online" | "offline";

type BookingEmailPayload = {
  fullName: string;
  clientEmail: string;
  meetingType: MeetingType;
  city: City;
  meetingFormat: MeetingFormat;
  datetime: string;
};

type EmailTemplate = {
  subject: string;
  text: string;
};

function getTransporter() {
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!process.env.SMTP_HOST || !user || !pass || !process.env.MAIL_FROM) {
    throw new Error("Missing SMTP email configuration");
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });
}

function getTemplate(settings: AdminSettings, payload: BookingEmailPayload): EmailTemplate {
  if (payload.meetingType === "consultation") {
    return {
      subject: settings.consultationPurchaseSaleSubject,
      text: settings.consultationPurchaseSaleText,
    };
  }

  if (payload.city === "warsaw") {
    return payload.meetingFormat === "online"
      ? {
          subject: settings.mortgageOnlineWarsawSubject,
          text: settings.mortgageOnlineWarsawText,
        }
      : {
          subject: settings.mortgageOfflineWarsawSubject,
          text: settings.mortgageOfflineWarsawText,
        };
  }

  return payload.meetingFormat === "online"
    ? {
        subject: settings.mortgageOnlineSubject,
        text: settings.mortgageOnlineText,
      }
    : {
        subject: settings.mortgageOfflineSubject,
        text: settings.mortgageOfflineText,
      };
}

function getAdminRecipients(settings: AdminSettings, payload: BookingEmailPayload) {
  const recipients = [settings.email1];

  if (payload.meetingType === "mortgage" && payload.city === "wroclaw") {
    recipients.push(settings.email2);
  }

  if (payload.meetingType === "mortgage" && payload.city === "warsaw") {
    recipients.push(settings.email3);
  }

  return recipients;
}

function getClientLastName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] ?? fullName.trim();
}

function getAdminSubject(payload: BookingEmailPayload, templateSubject: string) {
  const date = DateTime.fromISO(payload.datetime, { zone: "Europe/Warsaw" }).toFormat("dd.MM.yyyy");
  return `${date}, ${getClientLastName(payload.fullName)}, ${templateSubject}`;
}

function assertEmailData(template: EmailTemplate, adminRecipients: string[]) {
  if (!template.subject.trim() || !template.text.trim()) {
    throw new Error("Missing email template subject or body in admin settings");
  }
  if (adminRecipients.some((recipient) => !recipient.trim())) {
    throw new Error("Missing required admin email recipients");
  }
}

export async function sendBookingEmails(settings: AdminSettings, payload: BookingEmailPayload) {
  const template = getTemplate(settings, payload);
  const adminRecipients = getAdminRecipients(settings, payload);
  assertEmailData(template, adminRecipients);

  const transporter = getTransporter();
  const from = process.env.MAIL_FROM!;

  await Promise.all([
    transporter.sendMail({
      from,
      to: payload.clientEmail,
      subject: template.subject,
      text: template.text,
    }),
    ...adminRecipients.map((recipient) =>
      transporter.sendMail({
        from,
        to: recipient,
        subject: getAdminSubject(payload, template.subject),
        text: template.text,
      }),
    ),
  ]);
}
