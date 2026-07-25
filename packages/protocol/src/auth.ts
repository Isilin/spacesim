import { z } from "zod";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .refine((email) => emailPattern.test(email), "Invalid email address");
export const passwordSchema = z.string().min(8).max(200);

export const credentialsSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type Credentials = z.infer<typeof credentialsSchema>;
