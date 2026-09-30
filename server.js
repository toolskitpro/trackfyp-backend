// TrackFyp Backend
// -----------------------------------------------
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const multer = require("multer");
const ffmpegPath = require("ffmpeg-static");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 50 * 1024 * 1024 } });

const PORT = process.env.PORT || 3000;

// ---- Supabase client (subscriber database) ----
const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
    : null;

// ---- Safepay plan IDs (from Safepay dashboard) ----
const SAFEPAY_PLANS = {
  basic_pkr: "plan_5737def5-02dc-4d37-8569-05bbca09bb63",
  unlimited_pkr: "plan_6ee81df9-8790-4d77-9e8e-099e701574a0",
  basic_usd: "plan_d48cd495-4be1-4359-adc6-ef10c1c080f9",
  unlimited_usd: "plan_0be661f5-72b3-45f6-ac41-a06ec364fdc4",
};

// Safepay sandbox base URL (switch to production URL once approved)
const SAFEPAY_BASE_URL = "https://sandbox.api.getsafepay.com";

// Health check
app.get("/", (req, res) => {
  res.json({ status: "TrackFyp backend is running" });
});

// ---- Shared helper: TikTok video page se poora itemStruct nikalna ----
async function fetchTikTokItem(videoUrl) {
  const response = await axios.get(videoUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
    maxRedirects: 5,
  });
  const html = response.data;
  const match = html.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)<\/script>/s
  );
  if (!match) throw new Error("PAGE_STRUCTURE_CHANGED");
  const jsonData = JSON.parse(match[1]);
  const item =
    jsonData?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo
      ?.itemStruct;
  if (!item) throw new Error("NO_ITEM_DATA");
  return item;
}

// ---- /api/download?url=<tiktok video link> ----
app.get("/api/download", async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl || !videoUrl.includes("tiktok.com")) {
    return res.status(400).json({ error: "Sahi TikTok video link daalein." });
  }
  try {
    const item = await fetchTikTokItem(videoUrl);
    const noWatermarkUrl = item.video?.playAddr || item.video?.downloadAddr;
    if (!noWatermarkUrl) {
      return res.status(500).json({ error: "Download link nahi mila." });
    }
    res.json({
      success: true,
      downloadUrl: noWatermarkUrl,
      caption: item.desc || "",
      author: item.author?.uniqueId || "",
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      error:
        "Video process karne mein masla hua. Link check karein ya thodi der baad try karein.",
    });
  }
});

// ---- /api/analyze?url=<tiktok video link> ----
app.get("/api/analyze", async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl || !videoUrl.includes("tiktok.com")) {
    return res.status(400).json({ error: "Sahi TikTok video link daalein." });
  }
  try {
    const item = await fetchTikTokItem(videoUrl);

    const stats = item.stats || {};
    const views = stats.playCount || 0;
    const likes = stats.diggCount || 0;
    const comments = stats.commentCount || 0;
    const shares = stats.shareCount || 0;
    const caption = item.desc || "";
    const durationSec = item.video?.duration || 0;
    const hashtagCount = (caption.match(/#/g) || []).length;
    const genericTags = ["fyp", "viral", "foryou", "foryoupage"];
    const hasOnlyGeneric =
      hashtagCount > 0 &&
      genericTags.some((t) => caption.toLowerCase().includes("#" + t)) &&
      hashtagCount <= 2;

    const engagementRate = views > 0 ? ((likes + comments + shares) / views) * 100 : 0;

    const diagnosis = [];
    if (engagementRate < 3) {
      diagnosis.push({ type: "bad", text: "Engagement rate kam hai (" + engagementRate.toFixed(1) + "%). Caption mein clear call-to-action add karein." });
    } else if (engagementRate < 6) {
      diagnosis.push({ type: "warn", text: "Engagement rate theek hai (" + engagementRate.toFixed(1) + "%), lekin behtar ho sakta hai." });
    } else {
      diagnosis.push({ type: "good", text: "Engagement rate achi hai (" + engagementRate.toFixed(1) + "%)." });
    }

    if (durationSec > 0 && durationSec > 60) {
      diagnosis.push({ type: "warn", text: "Video " + durationSec + " second ki hai — 15-45 second wali videos generally behtar retention paati hain." });
    } else if (durationSec > 0) {
      diagnosis.push({ type: "good", text: "Video length (" + durationSec + "s) achi range mein hai." });
    }

    if (hashtagCount === 0) {
      diagnosis.push({ type: "bad", text: "Koi hashtag nahi mila. Hashtag Generator se 3-5 add karein." });
    } else if (hasOnlyGeneric) {
      diagnosis.push({ type: "warn", text: "Sirf generic hashtags (#fyp #viral) use huye hain — niche-specific bhi add karein." });
    } else {
      diagnosis.push({ type: "good", text: "Hashtags ka mix theek lag raha hai." });
    }

    if (caption.replace(/#\S+/g, "").trim().length < 10) {
      diagnosis.push({ type: "warn", text: "Caption bohot chota hai — thora context add karein." });
    }

    let score = 50;
    score += Math.min(engagementRate * 4, 30);
    if (!hasOnlyGeneric && hashtagCount > 0) score += 10;
    if (durationSec > 0 && durationSec <= 45) score += 10;
    score = Math.max(0, Math.min(100, Math.round(score)));

    res.json({
      success: true,
      score,
      views,
      likes,
      comments,
      shares,
      engagementRate: Number(engagementRate.toFixed(2)),
      durationSec,
      diagnosis,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      error: "Analysis mein masla hua. Link check karein ya thodi der baad try karein.",
    });
  }
});

// ---- /api/trending?country=pk|in|ae|us|uk|global ----
const COUNTRY_MAP = { pk: "PK", in: "IN", ae: "AE", us: "US", uk: "GB", global: "" };
app.get("/api/trending", async (req, res) => {
  const country = COUNTRY_MAP[req.query.country] ?? "";
  try {
    const response = await axios.get(
      "https://ads.tiktok.com/creative_radar_api/v1/popular_trend/hashtag/list",
      {
        params: {
          page: 1,
          limit: 10,
          period: 7,
          country_code: country,
          sort_by: "popular",
        },
        headers: { "User-Agent": "Mozilla/5.0" },
      }
    );
    const list = response.data?.data?.list || [];
    res.json({
      success: true,
      trends: list.map((t) => ({
        hashtag: t.hashtag_name,
        posts: t.video_views || t.publish_cnt || null,
      })),
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      error:
        "Trending data abhi fetch nahi ho saka — TikTok ne format badla ho sakta hai. Thodi der baad try karein.",
    });
  }
});

// =====================================================
// PREMIUM (AI Analysis) — ab subscription-gated hai
// =====================================================

// Check karta hai ke ye email active subscriber hai ya nahi (ya admin/test email hai)
async function isActiveSubscriber(email) {
  if (!email) return false;
  if (process.env.ADMIN_EMAIL && email.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase()) {
    return true; // apni testing ke liye bypass
  }
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("subscribers")
    .select("status")
    .eq("email", email.toLowerCase())
    .single();
  if (error || !data) return false;
  return data.status === "active";
}

// ---- /api/premium-analyze (POST, multipart: video, email) ----
app.post("/api/premium-analyze", upload.single("video"), async (req, res) => {
  const email = req.body.email;
  if (!req.file) {
    return res.status(400).json({ error: "Video file nahi mili." });
  }
  if (!email) {
    return res.status(400).json({ error: "Email zaroori hai." });
  }

  const allowed = await isActiveSubscriber(email);
  if (!allowed) {
    fs.unlinkSync(req.file.path);
    return res.status(402).json({
      error: "Ye email Premium subscriber nahi hai. Pehle subscribe karein.",
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error: "Server par AI key set nahi hai.",
    });
  }

  const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), "frames-"));

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(req.file.path)
        .on("end", resolve)
        .on("error", reject)
        .screenshots({
          count: 4,
          timemarks: ["0", "1.5", "3", "5"],
          folder: framesDir,
          filename: "frame-%i.png",
        });
    });

    const frameFiles = fs.readdirSync(framesDir).filter((f) => f.endsWith(".png"));
    const imageParts = frameFiles.map((f) => ({
      inline_data: {
        mime_type: "image/png",
        data: fs.readFileSync(path.join(framesDir, f)).toString("base64"),
      },
    }));

    const prompt = `Aap ek TikTok content expert hain. Ye video ke shuruati frames hain (pehle 5 second). Ye batayein (Roman Urdu mein, JSON format mein):
1. "score": 0-100 ke beech ek virality score
2. "hook_feedback": pehle 3 second ka hook kaisa hai, ek chhota sentence
3. "suggestions": array of 2-3 chhote, actionable Roman Urdu suggestions
Sirf JSON return karein, kuch aur text nahi.`;

    const geminiRes = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: prompt }, ...imageParts] }] }
    );

    const rawText = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    const result = JSON.parse(cleaned);

    res.json({ success: true, ...result });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "AI analysis mein masla hua. Dobara try karein." });
  } finally {
    fs.rmSync(framesDir, { recursive: true, force: true });
    fs.unlinkSync(req.file.path);
  }
});

// =====================================================
// PAYMENTS — Safepay checkout + webhook
// =====================================================

// ---- /api/create-checkout (POST: { email, plan }) ----
// plan = "basic_pkr" | "unlimited_pkr" | "basic_usd" | "unlimited_usd"
app.post("/api/create-checkout", async (req, res) => {
  const { email, plan } = req.body;
  const planId = SAFEPAY_PLANS[plan];

  if (!email || !planId) {
    return res.status(400).json({ error: "Email aur valid plan zaroori hai." });
  }
  if (!process.env.SAFEPAY_SECRET_KEY || !process.env.SAFEPAY_PUBLIC_KEY) {
    return res.status(500).json({ error: "Payment system abhi set nahi hai." });
  }

  try {
    // NOTE: Ye Safepay ka checkout-session init call hai. Agar Safepay ka
    // exact response format alag nikla to isay test ke baad adjust karna hoga
    // (bilkul jaisa Trending endpoint ke sath hua tha).
    const initRes = await axios.post(
      `${SAFEPAY_BASE_URL}/order/v1/init`,
      {
        merchant_api_key: process.env.SAFEPAY_PUBLIC_KEY,
        intent: "CYBERSOURCE",
        mode: "subscription",
        plan_id: planId,
        customer_email: email,
        currency: plan.includes("usd") ? "USD" : "PKR",
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.SAFEPAY_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const trackerToken = initRes.data?.data?.tracker?.token || initRes.data?.tracker;
    if (!trackerToken) {
      return res.status(500).json({ error: "Checkout session nahi ban saki." });
    }

    // Pre-register this email in Supabase as "pending" so webhook can update it later
    if (supabase) {
      await supabase.from("subscribers").upsert({
        email: email.toLowerCase(),
        plan_id: planId,
        status: "pending",
        updated_at: new Date().toISOString(),
      });
    }

    const checkoutUrl = `https://sandbox.getsafepay.com/checkout?tracker=${trackerToken}`;
    res.json({ success: true, checkoutUrl });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({
      error: "Checkout banane mein masla hua. Thodi der baad try karein.",
    });
  }
});

// ---- /api/safepay-webhook (POST) ----
// Safepay dashboard mein is URL ko webhook endpoint ki tarah add karna hoga:
// https://trackfyp-backend.onrender.com/api/safepay-webhook
app.post("/api/safepay-webhook", async (req, res) => {
  try {
    const event = req.body;
    console.log("Safepay webhook received:", JSON.stringify(event));

    const email = event?.data?.customer_email || event?.customer_email;
    const status = event?.data?.state === "TRACKER_ENDED" || event?.status === "success" ? "active" : "inactive";

    if (email && supabase) {
      await supabase.from("subscribers").upsert({
        email: email.toLowerCase(),
        status,
        updated_at: new Date().toISOString(),
      });
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Webhook process nahi hua." });
  }
});

// ---- /api/check-subscription?email=... ----
app.get("/api/check-subscription", async (req, res) => {
  const email = req.query.email;
  const active = await isActiveSubscriber(email);
  res.json({ active });
});

app.listen(PORT, () => {
  console.log(`TrackFyp backend running on port ${PORT}`);
});
