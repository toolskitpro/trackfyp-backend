# TrackFyp Backend

## Environment Variables (Render → Environment)

Ye saari keys Render dashboard ke **Environment** tab mein add karni hain —
kabhi bhi code ke andar seedha nahi likhni:

| Key | Kahan Se Milegi |
|---|---|
| `GEMINI_API_KEY` | aistudio.google.com |
| `SAFEPAY_PUBLIC_KEY` | Safepay Dashboard → Developer → API |
| `SAFEPAY_SECRET_KEY` | Safepay Dashboard → Developer → API |
| `SUPABASE_URL` | Supabase Project → Settings → API |
| `SUPABASE_KEY` | Supabase Project → Settings → API (anon public key) |
| `ADMIN_EMAIL` | Apna khud ka email — testing ke liye bina payment ke Premium use karne ke liye |

## Supabase Table Setup

SQL Editor mein ye query chalayein:

```sql
CREATE TABLE subscribers (
  email TEXT PRIMARY KEY,
  plan_id TEXT,
  status TEXT DEFAULT 'inactive',
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## Safepay Webhook Setup

Safepay dashboard mein webhook URL ye add karein:
```
https://trackfyp-backend.onrender.com/api/safepay-webhook
```

## Endpoints

- `GET /api/download?url=<link>` — video download link
- `GET /api/analyze?url=<link>` — Growth Score + diagnosis
- `GET /api/trending?country=pk|in|ae|us|uk|global` — trending hashtags
- `POST /api/premium-analyze` — video upload (multipart: `video`, `email`) — sirf active subscribers ke liye
- `POST /api/create-checkout` — body: `{ email, plan }` — plan: `basic_pkr` | `unlimited_pkr` | `basic_usd` | `unlimited_usd`
- `POST /api/safepay-webhook` — Safepay khud is par payment confirmation bhejta hai
- `GET /api/check-subscription?email=...` — check karta hai email active hai ya nahi

## Note — Testing Zaroori Hai

`/api/create-checkout` ka Safepay integration **pehli baar bina live test kiye likha gaya hai**
(bilkul jaisa Trending endpoint ke sath hua tha). Jab test karein aur error aaye, poora error
message bhej dein — Safepay ke asal response format ke mutabiq adjust karna pad sakta hai.
