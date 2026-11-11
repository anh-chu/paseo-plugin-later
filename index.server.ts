import type { PluginHandlerContext, PluginServerContext } from "@getpaseo/plugin/server";
import { cancelLater, scheduleLater } from "./server/commands";
import { LaterJobs, laterDataFile } from "./server/jobs";
import { laterCancelRpc, laterScheduleRpc } from "./shared/schedule";

export default function contribute(server: PluginServerContext) {
  // The plugin session outlives each handler, so the last API seen delivers due messages.
  let api: PluginHandlerContext["paseo"] | null = null;
  const jobs = new LaterJobs(laterDataFile(), () => api);
  const schedule = scheduleLater(jobs);
  const cancel = cancelLater(jobs);

  server.handle(laterScheduleRpc, async (input, context) => {
    api = context.paseo;
    return schedule(input, context);
  });
  server.handle(laterCancelRpc, async (input, context) => {
    api = context.paseo;
    return cancel(input);
  });

  return () => jobs.close();
}
