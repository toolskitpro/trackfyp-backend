// TrackFyp Backend — Video Downloader Service
// -----------------------------------------------
// Ye server ek hi kaam karta hai: TikTok video link lekar,
// bina watermark wala direct video link nikal kar wapis bhejta hai.
//
// Kaise kaam karta hai:
// 1. User TikTok video ka link bhejta hai (jaise tiktok.com/@user/video/123)
// 2. Ye server TikTok ke page ko khud "visit" karta hai (jaisa browser karta hai)
// 3. TikTok ke page ke andar chupa hua JSON data padhta hai (jisme video ka
//    asal, bina-watermark wala link hota hai)
// 4. Wo link wapis website ko bhej deta hai, jahan se user download kar sakta hai

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const multer = require("multer");
const ffmpegPath = require("ffmpeg-static");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const os = require("os");
const path = require("path");

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 50 * 1024 * 1024 } });

const PORT = process.env.PORT || 3000;

// Health check — Render ye use karta hai confirm karne ke liye ke server chal raha hai
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

// Main endpoint: /api/download?url=<tiktok video link>
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
// Video ka public metadata (views, likes, comments, caption, hashtags) nikal kar
// rule-based Growth Score aur diagnosis banata hai. Koi AI istemal nahi hoti.
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

    // ---- Rule-based diagnosis (Roman Urdu) ----
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

    // Score calculation (0-100)
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
// TikTok Creative Center ka public trending-hashtags data use karta hai.
// NOTE: Ye endpoint sabse zyada "fragile" hai — TikTok is public data ko
// kabhi kabhi restructure karta hai. Agar ye kaam na kare, iski wajah
// zyada tar yehi hoti hai.
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

// ---- /api/premium-analyze ----
// Premium feature: video upload karke, frames nikal kar, Gemini AI se
// hook/pacing/virality analysis karwata hai. GEMINI_API_KEY environment
// variable Render par set honi chahiye (code ke andar kabhi nahi likhni).
app.post("/api/premium-analyze", upload.single("video"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Video file nahi mili." });
  }
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error: "Server par AI key set nahi hai. Render Environment Variables mein GEMINI_API_KEY add karein.",
    });
  }

  const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), "frames-"));

  try {
    // Pehle 5 second ke 4 frames nikalte hain (hook ka sabse zaroori hissa)
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
      {
        contents: [
          {
            parts: [{ text: prompt }, ...imageParts],
          },
        ],
      }
    );

    const rawText =
      geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    const result = JSON.parse(cleaned);

    res.json({ success: true, ...result });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      error: "AI analysis mein masla hua. Dobara try karein.",
    });
  } finally {
    // Cleanup temp files
    fs.rmSync(framesDir, { recursive: true, force: true });
    fs.unlinkSync(req.file.path);
  }
});

app.listen(PORT, () => {
  console.log(`TrackFyp backend running on port ${PORT}`);
});
