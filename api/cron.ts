/**
 * Scheduled publishing.
 *
 * This previously queried a Firestore `scheduledPosts` collection while the
 * app wrote its posts to SQLite or Postgres — two unrelated datastores, so
 * nothing scheduled in the app was ever picked up and posts sat at "scheduled"
 * indefinitely. It now reads the same table the calendar writes to, and
 * publishes through the encrypted platform connections.
 */
import express from "express";
import { publishDuePosts } from "../src/server/publisher";

const app = express();
app.use(express.json());

app.get("/api/cron", async (req, res) => {
  // Vercel signs cron invocations with CRON_SECRET. Without it configured the
  // endpoint is open, which is only acceptable on a private deployment.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!secret) {
    console.warn("⚠️  CRON_SECRET is not set — /api/cron is callable by anyone who can reach it.");
  }

  try {
    const summary = await publishDuePosts({ limit: 25 });

    if (summary.considered === 0) {
      return res.status(200).json({ message: "Nothing due.", ...summary });
    }

    console.log(
      `Scheduled publishing: ${summary.published} published, ${summary.failed} failed, ` +
      `${summary.considered} due.`
    );

    res.status(200).json({
      message: `Published ${summary.published} of ${summary.considered} due post(s).`,
      ...summary
    });
  } catch (error) {
    console.error("Cron error:", error);
    res.status(500).json({ error: (error as Error).message || "Internal Server Error" });
  }
});

export default app;
