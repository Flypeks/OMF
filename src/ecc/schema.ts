import { z } from "zod";

export const EccConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    skills: z.boolean().default(true),
    commands: z.boolean().default(true),
    agents: z.boolean().default(true),
    rules: z.boolean().default(true),
    hooks: z.boolean().default(true),
    hooksProfile: z.enum(["minimal", "standard", "strict"]).default("standard"),
    root: z.string().trim().min(1).optional(),
  })
  .strict()
  .default({
    enabled: true,
    skills: true,
    commands: true,
    agents: true,
    rules: true,
    hooks: true,
    hooksProfile: "standard",
  });

export type EccConfig = z.infer<typeof EccConfigSchema>;
