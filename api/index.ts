import express from "express";
import cronApp from "./cron";

const app = express();
app.use(express.json({ limit: "50mb" }));

// Gemini routes have been moved to the frontend (src/services/geminiService.ts)
// to comply with security guidelines and support user-provided API keys for media generation.

app.use(cronApp);

export default app;
