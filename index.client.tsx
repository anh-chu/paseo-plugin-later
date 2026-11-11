import type { PluginClientContext } from "@getpaseo/plugin/client";
import { LaterRow } from "./client/later";
import { LATER_KIND, LATER_VERSION, laterRowSchema, laterScheduleRpc } from "./shared/schedule";

export default function contribute(client: PluginClientContext) {
  client.addTimelineRenderer({
    kind: LATER_KIND,
    version: LATER_VERSION,
    schema: laterRowSchema,
    Component: LaterRow,
  });
  client.addSlashCommand({
    name: "later",
    description: "Send this agent a message later",
    argumentHint: "16m <message>",
    context: "agent",
    async onSubmit({ agent, args, rpc }) {
      await rpc(laterScheduleRpc, { agentId: agent.id, args });
    },
  });
  return () => {};
}
