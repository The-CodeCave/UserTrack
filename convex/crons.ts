import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Immutable snapshots every 4 hours, ranking refreshed 10 minutes later.
crons.interval("sync all integrations", { hours: 4 }, internal.sync.runAll, {});
crons.cron("rerank leaderboard", "10 */4 * * *", internal.leaderboard.rerank, {});

export default crons;
