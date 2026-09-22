# TrackFyp Backend

Ye chhota Node.js server sirf **Video Downloader** feature ke liye hai —
TikTok link se bina-watermark video link nikalta hai.

## Render.com Par Deploy Karna

1. Ye folder (`backend`) ek **naye, alag GitHub repository** mein upload karein
   (jaise `trackfyp-backend`) — frontend wali repository se alag rakhein.
2. render.com par login karein.
3. Dashboard mein **"New +"** → **"Web Service"** par click karein.
4. Apni `trackfyp-backend` repository select karein.
5. Settings:
   - **Name:** trackfyp-backend
   - **Region:** jo bhi nazdeek ho (Singapore ya Frankfurt achi rahegi)
   - **Branch:** main
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
6. "Create Web Service" dabayein.
7. 2-3 minute mein deploy ho jayega. Render aapko ek link dega jaisa:
   `https://trackfyp-backend.onrender.com`

## Test Karna

Deploy hone ke baad, browser mein ye link kholein (apna asal backend link daal
kar):
```
https://trackfyp-backend.onrender.com/
```
Agar `{"status": "TrackFyp backend is running"}` dikhe, to server chal raha hai.

Phir video test karne ke liye:
```
https://trackfyp-backend.onrender.com/api/download?url=<TIKTOK_VIDEO_LINK>
```

## Free Tier Ka Note

Render ka free tier 15 minute tak use na hone par server ko "so" deta hai.
Agli request par wapis uthne mein 20-30 second lag sakte hain — ye normal hai,
koi masla nahi.

## Gemini API Key Add Karna (Premium Feature Ke Liye)

**Kabhi bhi API key seedha code ke andar na likhein.** Render par ye Environment
Variable ke through add karni hai:

1. Render dashboard mein apni `trackfyp-backend` service kholein.
2. Left menu mein **"Environment"** par click karein.
3. **"Add Environment Variable"** dabayein.
4. Key: `GEMINI_API_KEY`, Value: apni Google AI Studio wali key paste karein.
5. **"Save Changes"** — Render khud service ko restart kar dega naye key ke sath.

Is tareeqe se key kahin bhi publicly (GitHub, code) nazar nahi aati — sirf
Render ke private settings mein rehti hai.

## Endpoints (Overview)

- `GET /api/download?url=<link>` — video download link
- `GET /api/analyze?url=<link>` — Growth Score + diagnosis (public metadata se)
- `GET /api/trending?country=pk|in|ae|us|uk|global` — trending hashtags
- `POST /api/premium-analyze` — video upload, AI se virality score (multipart/form-data, field name "video")
