import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { RpcInput } from "@getpaseo/plugin";
import { laterCancelRpc, laterScheduleRpc, parseWhen, USAGE } from "../shared/schedule";
import { publishScheduled, type LaterJobs } from "./jobs";

const MAX_MESSAGE_CHARS = 8_000;

/** `/later 16m <message>`: checks the agent, then stores the job and its timeline row. */
export function scheduleLater(jobs: LaterJobs) {
  return async (input: RpcInput<typeof laterScheduleRpc>, { paseo }: PluginHandlerContext) => {
    const match = /^(\S+)\s+([\s\S]+)$/.exec(input.args.trim());
    if (!match) throw new Error(USAGE);
    const message = match[2].trim();
    if (!message) throw new Error(USAGE);
    if (message.length > MAX_MESSAGE_CHARS) {
      throw new Error(`The message is longer than ${MAX_MESSAGE_CHARS} characters.`);
    }
    const when = parseWhen(match[1], new Date());
    if ("error" in when) throw new Error(when.error);

    const handle = paseo.agents.ref(input.agentId);
    const snapshot = await handle.refresh();
    if (!snapshot) throw new Error("This agent no longer exists.");
    if (snapshot.agent.archivedAt) throw new Error("This agent is archived.");

    const job = await jobs.schedule(input.agentId, message, when.at);
    await publishScheduled(paseo, job);
    return { id: job.id, dueAt: job.dueAt, message: job.message };
  };
}

export function cancelLater(jobs: LaterJobs) {
  return async (input: RpcInput<typeof laterCancelRpc>) => ({ cancelled: await jobs.cancel(input.id) });
}
