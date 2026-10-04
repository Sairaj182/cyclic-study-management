import { z } from 'zod'

const schema = z.object({
    CORS_ORIGIN: z
    .string()
    .default("http://localhost:3000")
    .transform((s) =>
      s
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
    ),
    NODE_ENV: z
    .enum(["development","production","testing"])
    .default("production"),
    API_PORT: z
    .coerce
    .number()
    .default(4000),
    HOST: z.string().default("0.0.0.0"),
    JWT_SECRET: z.string({ error: "JWT_SECRET is required" }).min(32),
    BETTER_AUTH_SECRET: z
      .string({ error: "BETTER_AUTH_SECRET is required" })
      .min(32),
    BETTER_AUTH_URL: z.string().url().default("https://csm.sairajraithatha.me/auth"),
    
})


const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}


export const env = parsed.data;