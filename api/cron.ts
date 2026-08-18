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
        const platform = (post.platform || '').toLowerCase();
        if (platform.includes('twitter') || platform.includes('x')) {
          if (!process.env.TWITTER_API_KEY) throw new Error("Twitter API Key not configured on Vercel");
          const twRes = await fetch('https://api.twitter.com/2/tweets', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.TWITTER_API_KEY}`
            },
            body: JSON.stringify({ text: post.content })
          });
          if (!twRes.ok) throw new Error(`Twitter API error: ${twRes.statusText}`);
          success = true;
        } else if (platform.includes('linkedin')) {
          if (!process.env.LINKEDIN_ACCESS_TOKEN) throw new Error("LinkedIn Token not configured on Vercel");
          const liRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
              'X-Restli-Protocol-Version': '2.0.0'
            },
            body: JSON.stringify({
              author: `urn:li:person:${process.env.LINKEDIN_PERSON_URN || 'me'}`,
              lifecycleState: 'PUBLISHED',
              specificContent: {
                'com.linkedin.ugc.ShareContent': {
                  shareCommentary: { text: post.content },
                  shareMediaCategory: 'NONE'
                }
              },
              visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
            })
          });
          if (!liRes.ok) throw new Error(`LinkedIn API error: ${liRes.statusText}`);
          success = true;
        } else if (platform.includes('facebook')) {
          if (!process.env.FACEBOOK_ACCESS_TOKEN) throw new Error("Facebook Token not configured on Vercel");
          const fbRes = await fetch(`https://graph.facebook.com/v19.0/me/feed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: post.content, access_token: process.env.FACEBOOK_ACCESS_TOKEN })
          });
          if (!fbRes.ok) throw new Error(`Facebook API error: ${fbRes.statusText}`);
          success = true;
        } else {
          throw new Error(`Unsupported or unconfigured platform: ${post.platform}`);
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
