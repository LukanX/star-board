import { z } from "zod";

export const updateAccountProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
});