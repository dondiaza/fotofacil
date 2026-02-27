import "server-only";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

let resend: Resend | null = null;

function getResend() {
  if (!env.RESEND_API_KEY) {
    return null;
  }
  if (!resend) {
    resend = new Resend(env.RESEND_API_KEY);
  }
  return resend;
}

type SmtpConfig = {
  enabled: boolean;
  host: string | null;
  port: number | null;
  secure: boolean;
  user: string | null;
  pass: string | null;
  from: string | null;
  replyTo: string | null;
};

async function getSmtpConfig(): Promise<SmtpConfig> {
  const config = await prisma.appConfig.findUnique({
    where: { id: 1 },
    select: {
      smtpEnabled: true,
      smtpHost: true,
      smtpPort: true,
      smtpSecure: true,
      smtpUser: true,
      smtpPass: true,
      smtpFrom: true,
      smtpReplyTo: true
    }
  });

  return {
    enabled: config?.smtpEnabled ?? false,
    host: config?.smtpHost ?? null,
    port: config?.smtpPort ?? null,
    secure: config?.smtpSecure ?? false,
    user: config?.smtpUser ?? null,
    pass: config?.smtpPass ?? null,
    from: config?.smtpFrom ?? null,
    replyTo: config?.smtpReplyTo ?? null
  };
}

async function sendBySmtpIfConfigured(recipients: string[], subject: string, text: string) {
  const smtp = await getSmtpConfig();
  if (!smtp.enabled || !smtp.host || !smtp.port || !smtp.from || recipients.length === 0) {
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    ...(smtp.user
      ? {
          auth: {
            user: smtp.user,
            pass: smtp.pass || ""
          }
        }
      : {})
  });

  await transporter.sendMail({
    from: smtp.from,
    to: recipients,
    replyTo: smtp.replyTo || undefined,
    subject,
    text
  });

  return true;
}

async function sendByResendIfConfigured(recipients: string[], subject: string, text: string) {
  const client = getResend();
  if (!client || recipients.length === 0) {
    return false;
  }

  await client.emails.send({
    from: "FotoFacil <noreply@fotofacil.app>",
    to: recipients,
    subject,
    text
  });

  return true;
}

async function sendNotification(recipients: string[], subject: string, text: string) {
  const unique = [...new Set(recipients.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  if (unique.length === 0) {
    return;
  }

  const sentBySmtp = await sendBySmtpIfConfigured(unique, subject, text).catch(() => false);
  if (sentBySmtp) {
    return;
  }
  await sendByResendIfConfigured(unique, subject, text);
}

export async function notifyAdminByEmail(subject: string, text: string) {
  if (!env.ADMIN_NOTIFICATION_EMAIL) {
    return;
  }
  await sendNotification([env.ADMIN_NOTIFICATION_EMAIL], subject, text);
}

export async function notifyManyByEmail(recipients: string[], subject: string, text: string) {
  await sendNotification(recipients, subject, text);
}
