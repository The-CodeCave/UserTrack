import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Snapshots every 4 hours (spread over 10 min), ranking + trending 20 minutes later.
crons.interval("sync all integrations", { hours: 4 }, internal.sync.runAll, {});
crons.cron("rerank leaderboard", "20 */4 * * *", internal.leaderboard.rerank, {});
// Daily sweep: milestones, benchmarks, trust review, rank history, quiet-product check.
crons.cron("daily sweep", "30 3 * * *", internal.daily.run, {});
// Weekly digest (opt-in), Monday 08:00 UTC.
crons.cron("weekly digest", "0 8 * * 1", internal.digest.generate, {});
// Monthly report for the completed month, generated on the 1st at 05:00 UTC and delivered at 09:00 local time.
crons.cron("monthly growth report", "0 5 1 * *", internal.email.reports.generateMonthly, {});

export default crons;
