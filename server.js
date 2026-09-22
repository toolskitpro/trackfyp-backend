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

const app = express();
app.use(cors()); // taake website (GitHub Pages) is backend ko call kar sake

const PORT = process.env.PORT || 3000;

// Health check — Render ye use karta hai confirm karne ke liye ke server chal raha hai
app.get("/", (req, res) => {
  res.json({ status: "TrackFyp backend is running" });
});

// Main endpoint: /api/download?url=<tiktok video link>
app.get("/api/download", async (req, res) => {
  const videoUrl = req.query.url;

  if (!videoUrl || !videoUrl.includes("tiktok.com")) {
    return res.status(400).json({ error: "Sahi TikTok video link daalein." });
  }

  try {
    // TikTok ke page ko ek real browser jaisa "User-Agent" bhej kar fetch karte hain
    const response = await axios.get(videoUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
      maxRedirects: 5,
    });

    const html = response.data;

    // TikTok apne page ke andar ek <script> tag mein poora video data
    // JSON format mein chupata hai. Hum usay dhoondte hain.
    const match = html.match(
      /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)<\/script>/s
    );

    if (!match) {
      return res.status(500).json({
        error:
          "Video data nahi mila. TikTok ne apna page structure badal diya ho sakta hai.",
      });
    }

    const jsonData = JSON.parse(match[1]);

    // Video info is path ke andar hoti hai (TikTok ke current structure ke mutabiq)
    const videoDetail =
      jsonData?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo
        ?.itemStruct;

    if (!videoDetail) {
      return res.status(500).json({ error: "Video details nahi mile." });
    }

    const noWatermarkUrl =
      videoDetail.video?.playAddr || videoDetail.video?.downloadAddr;
    const caption = videoDetail.desc || "";
    const author = videoDetail.author?.uniqueId || "";

    if (!noWatermarkUrl) {
      return res.status(500).json({ error: "Download link nahi mila." });
    }

    res.json({
      success: true,
      downloadUrl: noWatermarkUrl,
      caption,
      author,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      error:
        "Video process karne mein masla hua. Link check karein ya thodi der baad try karein.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`TrackFyp backend running on port ${PORT}`);
});
