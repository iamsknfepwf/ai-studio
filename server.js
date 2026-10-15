require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const BRIDGEGATE_BASE = "https://bridgegate-frontend.onrender.com";
const API_KEY = process.env.BRIDGEGATE_KEY;

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname)));

// ── Auth check middleware ────────────────────────────────
function requireKey(req, res, next) {
  if (!API_KEY) return res.status(500).json({ error: "BRIDGEGATE_KEY not set in environment" });
  next();
}

// ── Helper: forward to Bridgegate with auth ──────────────
async function bg(method, path, body) {
  const opts = {
    method,
    headers: {
      "X-API-Key": API_KEY,
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BRIDGEGATE_BASE}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || "Upstream error"), { status: res.status, data });
  return data;
}

// ── POST /api/generate/image ─────────────────────────────
app.post("/api/generate/image", requireKey, async (req, res) => {
  try {
    const {
      prompt, model = "gemini-2.5-flash-image",
      aspect_ratio = "16:9", generations_count = 1,
      resolution, quality, output_format, creativity,
      ref_url, images, negative_prompt,
    } = req.body;

    if (!prompt) return res.status(400).json({ error: "prompt is required" });

    const body = { prompt, model, aspect_ratio, generations_count };
    if (resolution)       body.resolution       = resolution;
    if (quality)          body.quality          = quality;
    if (output_format)    body.output_format    = output_format;
    if (creativity)       body.creativity       = creativity;
    if (ref_url)          body.ref_url          = ref_url;
    if (images)           body.images           = images;
    if (negative_prompt)  body.negative_prompt  = negative_prompt;

    const job = await bg("POST", "/proxy/images/generate", body);
    res.json(job);
  } catch (err) {
    console.error("[generate/image]", err.message);
    res.status(err.status || 500).json({ error: err.message, detail: err.data });
  }
});

// ── POST /api/generate/video ─────────────────────────────
app.post("/api/generate/video", requireKey, async (req, res) => {
  try {
    const {
      prompt, model = "veo-3.1-fast-generate-001",
      aspect_ratio = "16:9", duration_secs,
      generate_audio = true, resolution,
      start_image_url, end_image_url,
      negative_prompt, reference_images,
    } = req.body;

    if (!prompt) return res.status(400).json({ error: "prompt is required" });

    const body = { prompt, model, aspect_ratio };
    if (duration_secs !== undefined) body.duration_secs    = duration_secs;
    if (generate_audio !== undefined) body.generate_audio  = generate_audio;
    if (resolution)        body.resolution        = resolution;
    if (start_image_url)   body.start_image_url   = start_image_url;
    if (end_image_url)     body.end_image_url     = end_image_url;
    if (negative_prompt)   body.negative_prompt   = negative_prompt;
    if (reference_images)  body.reference_images  = reference_images;

    const job = await bg("POST", "/proxy/videos/generate", body);
    res.json(job);
  } catch (err) {
    console.error("[generate/video]", err.message);
    res.status(err.status || 500).json({ error: err.message, detail: err.data });
  }
});

// ── GET /api/jobs/:id ─────────────────────────────────────
app.get("/api/jobs/:id", requireKey, async (req, res) => {
  try {
    const job = await bg("GET", `/proxy/jobs/${req.params.id}`);
    res.json(job);
  } catch (err) {
    console.error("[jobs]", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── GET /api/models ───────────────────────────────────────
app.get("/api/models", requireKey, async (req, res) => {
  try {
    const { type = "image" } = req.query;
    const data = await bg("GET", `/proxy/models?type=${type}`);
    res.json(data);
  } catch (err) {
    console.error("[models]", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── POST /api/upload ──────────────────────────────────────
app.post("/api/upload", requireKey, async (req, res) => {
  try {
    const { image_data, mime_type, image_url } = req.body;
    if (!image_data && !image_url) return res.status(400).json({ error: "image_data or image_url required" });
    const body = image_url ? { image_url } : { image_data, mime_type };
    const data = await bg("POST", "/proxy/upload", body);
    res.json(data);
  } catch (err) {
    console.error("[upload]", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── GET /api/accounts ─────────────────────────────────────
app.get("/api/accounts", requireKey, async (req, res) => {
  try {
    const data = await bg("GET", "/proxy/accounts");
    res.json(data);
  } catch (err) {
    console.error("[accounts]", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── GET /api/health ───────────────────────────────────────
app.get("/api/health", async (req, res) => {
  try {
    const data = await fetch(`${BRIDGEGATE_BASE}/health`).then(r => r.json());
    res.json({ local: "ok", upstream: data });
  } catch (err) {
    res.json({ local: "ok", upstream: "unreachable" });
  }
});

// ── Serve frontend for all other routes ──────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`AI Studio running at http://localhost:${PORT}`);
  if (!API_KEY) console.warn("⚠  BRIDGEGATE_KEY not set — API calls will fail");
});
