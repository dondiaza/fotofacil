import { z } from "zod";

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
};

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .default("file:./dev.db"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(16).default("dev_session_secret_change_me_123456"),
  CRON_SECRET: z.string().min(10).default("dev_cron_secret_change_me"),
  DEFAULT_ADMIN_EMAIL: z.string().email().default("admin@fotofacil.local"),
  DEFAULT_ADMIN_PASSWORD: z.string().min(8).default("ChangeMe123!"),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.preprocess(emptyToUndefined, z.string().optional()),
  GOOGLE_PRIVATE_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  GOOGLE_DRIVE_ROOT_FOLDER_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  GOOGLE_IMPERSONATE_USER: z.preprocess(emptyToUndefined, z.string().optional()),
  RESEND_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  ADMIN_NOTIFICATION_EMAIL: z.preprocess(emptyToUndefined, z.string().email().optional())
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Invalid environment variables:\n${issues.join("\n")}`);
}

export const env = {
  ...parsed.data,
  GOOGLE_PRIVATE_KEY: parsed.data.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n")
};
