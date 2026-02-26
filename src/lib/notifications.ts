import { Resend } from "resend";
import { env } from "@/lib/env";

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

export async function notifyAdminByEmail(subject: string, text: string) {
  const client = getResend();
  if (!client || !env.ADMIN_NOTIFICATION_EMAIL) {
    return;
  }

  await client.emails.send({
    from: "FotoFacil <noreply@fotofacil.app>",
    to: [env.ADMIN_NOTIFICATION_EMAIL],
    subject,
    text
  });
}
