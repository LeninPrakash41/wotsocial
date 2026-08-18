import express from "express";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = express();
app.use(express.json());

// Initialize Firebase Admin if environment variables are present
const initFirebaseAdmin = () => {
  if (getApps().length > 0) return true;

  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      console.warn("FIREBASE_SERVICE_ACCOUNT_JSON is missing");
      return false;
    }

    // Parse the JSON string
    const serviceAccount = JSON.parse(serviceAccountJson);

    initializeApp({
      credential: cert(serviceAccount),
    });
    return true;
  } catch (error) {
    console.error("Failed to initialize Firebase Admin", error);
    return false;
  }
};

app.get("/api/cron", async (req, res) => {
  try {
    // 1. Verify Vercel Cron Request
    const authHeader = req.headers.authorization;
    if (
      process.env.CRON_SECRET &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // 2. Initialize DB
    if (!initFirebaseAdmin()) {
      return res.status(500).json({ error: "Firebase Admin not configured" });
    }

    const db = getFirestore();
    const now = new Date();

    // 3. Fetch scheduled posts that are due
    const postsRef = db.collectionGroup("scheduledPosts");
    const snapshot = await postsRef
      .where("status", "==", "pending")
      .where("scheduledFor", "<=", now)
      .get();

    if (snapshot.empty) {
      return res.status(200).json({ message: "No posts due." });
    }

    const results = [];

    // 4. Process each post
    for (const doc of snapshot.docs) {
      const post = doc.data();
      const parentRef = doc.ref.parent.parent;
      if (!parentRef) continue;

      let success = false;
      let errorMsg = null;

      try {
        // Retrieve keys from environment variables directly for security (BYO Vercel)
        switch (post.platform) {
          case "twitter":
            // Implement Twitter API call using process.env.TWITTER_API_KEY
            if (!process.env.TWITTER_API_KEY)
              throw new Error("Twitter API Key not configured on Vercel");
            // Mock API request here...
            console.log(`Mock posting to Twitter: ${post.content}`);
            success = true;
            break;
          case "linkedin":
            if (!process.env.LINKEDIN_ACCESS_TOKEN)
              throw new Error("LinkedIn Token not configured on Vercel");
            console.log(`Mock posting to LinkedIn: ${post.content}`);
            success = true;
            break;
          // Add others...
          default:
            throw new Error(`Unsupported platform: ${post.platform}`);
        }
      } catch (err) {
        success = false;
        errorMsg = err instanceof Error ? err.message : String(err);
      }

      // 5. Update DB
      await doc.ref.update({
        status: success ? "published" : "failed",
        publishedAt: success ? new Date() : null,
        error: errorMsg,
      });

      results.push({ id: doc.id, success, error: errorMsg });
    }

    res.status(200).json({ message: "Cron executed", results });
  } catch (error) {
    console.error("Cron Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default app;
