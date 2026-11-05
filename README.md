# 🎵 Song Studio

An AI music generator powered by [SunoAPI.org](https://docs.sunoapi.org/). Users describe a song (or write/generate lyrics), pick a vibe, and get two full tracks they can play, read lyrics for, and download.

## Features
- **Simple mode** – describe the song + pick genre chips (or hit 🎲 *Surprise me*).
- **Custom mode** – title, your own lyrics, ✨ *AI lyric writer* (SunoAPI lyrics endpoint), styles to avoid, voice gender, length (10s–6min), style strength, weirdness, variety.
- Instrumental toggle and model picker (V6, V6 Wild, V6 Mini).
- Live progress with streaming preview as soon as the first version is ready.
- Library saved in the browser, sticky player, lyrics viewer, MP3 download.
- Remaining-credits indicator.
- Optional password gate so strangers can't burn your credits.

## Tech stack
- Static front end (`public/`) – plain HTML/CSS/JS, no build step.
- Netlify Functions (`netlify/functions/`) proxy every SunoAPI call, so **the API key never reaches the browser**.

| Route | Purpose |
|---|---|
| `POST /api/generate` | Start a music generation (`/api/v1/generate`) |
| `GET /api/status?taskId=` | Poll generation (`/api/v1/generate/record-info`) |
| `POST /api/lyrics` | Start lyrics generation (`/api/v1/lyrics`) |
| `GET /api/lyrics-status?taskId=` | Poll lyrics (`/api/v1/lyrics/record-info`) |
| `GET /api/credits` | Remaining credits (`/api/v1/generate/credit`) |
| `POST /api/callback` | Required SunoAPI webhook target (acknowledged; the app polls) |

## Deploy on Netlify
1. In Netlify: **Add new site → Import an existing project** → pick this repo, branch `main`.
   Build settings are read from `netlify.toml` (no build command; publish dir `public`).
2. **Site configuration → Environment variables** → add:
   - `SUNO_API_KEY` = your SunoAPI.org key (**required**)
   - `APP_PASSWORD` = any password (*optional*, recommended for a public URL)
3. Deploy (redeploy after adding/changing env vars).

## Local development
```bash
npm i -g netlify-cli
cp .env.example .env   # put your key in .env (never commit it)
netlify dev
```

## Tests
```bash
npm test
```
