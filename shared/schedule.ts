import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** Timeline row kind and version, shared by the daemon write and the client renderer. */
export const LATER_KIND = "later-message";
export const LATER_VERSION = 1;

export const laterRowSchema = z.object({
  id: z.string(),
  dueAt: z.string(),
  message: z.string(),
  state: z.enum(["pending", "sent", "failed", "cancelled"]),
  error: z.string().optional(),
});

export type LaterRow = z.infer<typeof laterRowSchema>;

export const laterScheduleRpc = defineRpc({
  name: "later.schedule",
  input: z.object({ agentId: z.string().min(1), args: z.string() }),
  output: z.object({
    id: z.string(),
    dueAt: z.string(),
    message: z.string(),
  }),
});

export const laterCancelRpc = defineRpc({
  name: "later.cancel",
  input: z.object({ id: z.string().min(1) }),
  output: z.object({ cancelled: z.boolean() }),
});

export const USAGE = "Usage: /later <when> <message>, for example /later 16m continue.";

/** Longest delay accepted, in milliseconds. */
export const MAX_DELAY_MS = 24 * 60 * 60 * 1000;

/**
 * Reads the first word of a slash command as a delay or clock time.
 * Accepts 45s, 16m, 2h, 1h30m, a bare number of minutes, and 14:30.
 */
export function parseWhen(text: string, now: Date): { at: Date } | { error: string } {
  const value = text.trim().toLowerCase();
  if (!value) return { error: USAGE };

  const clock = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (clock) {
    const hours = Number(clock[1]);
    const minutes = Number(clock[2]);
    if (hours > 23 || minutes > 59) return { error: `"${text}" is not a valid time. ${USAGE}` };
    const at = new Date(now);
    at.setHours(hours, minutes, 0, 0);
    if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
    if (at.getTime() - now.getTime() > MAX_DELAY_MS) return { error: "Keep the time within 24 hours." };
    return { at };
  }

  const bare = /^(\d+)$/.exec(value);
  if (bare) {
    const minutes = Number(bare[1]);
    if (minutes <= 0) return { error: "The delay must be positive." };
    return within(now, minutes * 60_000);
  }

  const parts = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value.replace(/\s+/g, ""));
  if (!parts || (!parts[1] && !parts[2] && !parts[3])) return { error: `"${text}" is not a delay. ${USAGE}` };
  const ms =
    Number(parts[1] ?? 0) * 3_600_000 + Number(parts[2] ?? 0) * 60_000 + Number(parts[3] ?? 0) * 1_000;
  if (ms <= 0) return { error: "The delay must be positive." };
  return within(now, ms);
}

function within(now: Date, ms: number): { at: Date } | { error: string } {
  if (ms > MAX_DELAY_MS) return { error: "Keep the delay within 24 hours." };
  return { at: new Date(now.getTime() + ms) };
}
