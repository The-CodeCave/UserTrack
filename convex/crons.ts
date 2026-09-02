import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Snapshots every 4 hours (spread over 10 min), ranking + trending 20 minutes later.
crons.interval("sync all integrations", { hours: 4 }, internal.sync.runAll, {});
crons.cron("rerank leaderboard", "20 */4 * * *", internal.leaderboard.rerank, {});
// Daily sweep: milestones, benchmarks, trust review.
crons.cron("daily sweep", "30 3 * * *", internal.daily.run, {});
// Weekly digest, Monday 08:00 UTC.
crons.cron("weekly digest", "0 8 * * 1", internal.digest.generate, {});

export default crons;
