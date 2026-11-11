import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { LATER_KIND, LATER_VERSION, type LaterRow } from "../shared/schedule";

type PaseoApi = PluginHandlerContext["paseo"];

const jobSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  message: z.string(),
  dueAt: z.string(),
  createdAt: z.string(),
  state: z.enum(["pending", "sent", "failed", "cancelled"]),
  error: z.string().optional(),
});

export type LaterJob = z.infer<typeof jobSchema>;

/** Stored beside the other plugins, under the daemon's Paseo home. */
export function laterDataFile(): string {
  const home = process.env.PASEO_HOME?.trim() || join(homedir(), ".paseo");
  return join(home, "plugin-data", "later", "jobs.json");
}

/** How long delivery keeps retrying while the plugin has no Paseo session yet. */
const NO_SESSION_RETRY_MS = 15_000;
const NO_SESSION_LIMIT_MS = 30 * 60_000;

/**
 * Holds one-off messages until their time, then sends each to its agent. Pending jobs
 * survive a plugin reload because they live in a JSON file.
 */
export class LaterJobs {
  private readonly jobs = new Map<string, LaterJob>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly ready: Promise<void>;
  private closing = false;
  private saving: Promise<void> = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly getApi: () => PaseoApi | null,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.ready = this.load();
  }

  async schedule(agentId: string, message: string, dueAt: Date): Promise<LaterJob> {
    await this.ready;
    const job: LaterJob = {
      id: randomUUID(),
      agentId,
      message,
      dueAt: dueAt.toISOString(),
      createdAt: this.now().toISOString(),
      state: "pending",
    };
    this.jobs.set(job.id, job);
    await this.save();
    this.arm(job);
    return job;
  }

  async cancel(id: string): Promise<boolean> {
    await this.ready;
    const job = this.jobs.get(id);
    if (!job || job.state !== "pending") return false;
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    job.state = "cancelled";
    await this.save();
    await this.publish(job);
    return true;
  }

  close(): void {
    this.closing = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private async load(): Promise<void> {
    let raw: string;
    try {
      raw = await readFile(this.file, "utf8");
    } catch {
      return;
    }
    try {
      for (const job of z.array(jobSchema).parse(JSON.parse(raw))) {
        if (job.state === "pending" && Date.parse(job.dueAt) > 0) {
          this.jobs.set(job.id, job);
          this.arm(job);
        }
      }
    } catch (error) {
      console.error("later: ignored an unreadable jobs file:", error);
    }
  }

  private arm(job: LaterJob): void {
    clearTimeout(this.timers.get(job.id));
    const delay = Math.max(0, Date.parse(job.dueAt) - this.now().getTime());
    this.timers.set(
      job.id,
      setTimeout(() => void this.fire(job.id), delay),
    );
  }

  private async fire(id: string): Promise<void> {
    this.timers.delete(id);
    const job = this.jobs.get(id);
    if (this.closing || !job || job.state !== "pending") return;

    const api = this.getApi();
    if (!api) {
      // The plugin session arrives with the first command or hook. Keep trying for a while.
      if (this.now().getTime() - Date.parse(job.dueAt) < NO_SESSION_LIMIT_MS) {
        this.timers.set(
          id,
          setTimeout(() => void this.fire(id), NO_SESSION_RETRY_MS),
        );
      } else {
        await this.finish(job, { state: "failed", error: "Paseo was not ready to deliver this message." });
      }
      return;
    }

    try {
      const handle = api.agents.ref(job.agentId);
      const snapshot = await handle.refresh();
      if (!snapshot) throw new Error("The agent no longer exists.");
      if (snapshot.agent.archivedAt) throw new Error("The agent is archived.");
      await handle.send(job.message, { activeTurnBehavior: "steer" });
      await this.finish(job, { state: "sent" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`later: could not deliver to ${job.agentId}:`, message);
      await this.finish(job, { state: "failed", error: message });
    }
  }

  private async finish(job: LaterJob, patch: Pick<LaterJob, "state"> & { error?: string }): Promise<void> {
    job.state = patch.state;
    job.error = patch.error;
    await this.save();
    await this.publish(job);
  }

  /** Rewrites the job's timeline row so the session shows the current state. */
  private async publish(job: LaterJob): Promise<void> {
    const api = this.getApi();
    if (!api) return;
    try {
      await publishScheduled(api, job);
    } catch (error) {
      console.error("later: could not update the timeline row:", error);
    }
  }

  private save(): Promise<void> {
    this.saving = this.saving.catch(() => {}).then(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      const temporary = `${this.file}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify([...this.jobs.values()], null, 2));
      await rename(temporary, this.file);
    });
    return this.saving;
  }
}

/** Adds or replaces the scheduling row that tells the session what waits and when. */
export async function publishScheduled(api: PaseoApi, job: LaterJob): Promise<void> {
  const data: LaterRow = {
    id: job.id,
    dueAt: job.dueAt,
    message: job.message,
    state: job.state,
    ...(job.error ? { error: job.error } : {}),
  };
  await api.agents.ref(job.agentId).timeline.append({
    type: "plugin",
    id: `later-${job.id}`,
    kind: LATER_KIND,
    version: LATER_VERSION,
    data,
  });
}
