import { z } from "zod";

export const evalSpec = {
  name: "eval",
  description:
    "Execute JavaScript or Python in a persistent per-session kernel. State, imports and variables survive across calls; each run executes only the supplied code. Use operation reset to clear a broken kernel and status for kernel state. Timeouts and abort terminate the affected kernel, which restarts cleanly on the next call.",
  schema: z
    .object({
      language: z.enum(["javascript", "python"]).describe("Kernel language"),
      operation: z.enum(["run", "reset", "status"]).default("run").describe("Kernel operation"),
      code: z
        .string()
        .min(1)
        .max(256 * 1024)
        .optional()
        .describe("Code to execute in the persistent kernel; required for operation run"),
      timeoutMs: z
        .number()
        .int()
        .positive()
        .max(120_000)
        .optional()
        .describe("Execution timeout in milliseconds; default 60 seconds"),
    })
    .strict()
    .superRefine((args, context) => {
      if (args.operation === "run" && !args.code) {
        context.addIssue({ code: "custom", path: ["code"], message: "code is required to run" });
      }
      if (args.operation !== "run" && args.code) {
        context.addIssue({
          code: "custom",
          path: ["code"],
          message: "code is valid only for operation run",
        });
      }
    }),
};

export type EvalArgs = z.infer<typeof evalSpec.schema>;
