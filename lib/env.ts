import { z } from "zod";

const publicEnvSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  })
  .superRefine((env, context) => {
    const hasUrl = Boolean(env.NEXT_PUBLIC_SUPABASE_URL);
    const hasKey = Boolean(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

    if (hasUrl !== hasKey) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Supabase URL and publishable key must be configured together.",
        path: [hasUrl ? "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" : "NEXT_PUBLIC_SUPABASE_URL"],
      });
    }
  });

const serverEnvSchema = publicEnvSchema.extend({
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_SITE_URL: z.string().url().optional(),
  OPENROUTER_APP_NAME: z.string().min(1).optional(),
  OPENROUTER_TEXT_MODEL: z.string().min(1).default("openai/gpt-4o-mini"),
  OPENROUTER_IMAGE_MODEL: z.string().min(1).default("openai/gpt-image-1"),
});

function parseEnvironment<T extends z.ZodType>(schema: T, values: Record<string, string | undefined>): z.output<T> {
  const result = schema.safeParse(values);

  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid environment configuration. ${details}`);
  }

  return result.data;
}

export function getPublicEnv() {
  return parseEnvironment(publicEnvSchema, {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
}

export function getServerEnv() {
  return parseEnvironment(serverEnvSchema, {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_SITE_URL: process.env.OPENROUTER_SITE_URL,
    OPENROUTER_APP_NAME: process.env.OPENROUTER_APP_NAME,
    OPENROUTER_TEXT_MODEL: process.env.OPENROUTER_TEXT_MODEL,
    OPENROUTER_IMAGE_MODEL: process.env.OPENROUTER_IMAGE_MODEL,
  });
}
