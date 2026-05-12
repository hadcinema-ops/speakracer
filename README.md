# SpeakRacer 🎤

Multiplayer real-time voice racing game. Say the passage faster than your opponent. First to finish wins.

## Stack
- **Backend:** Node.js + Express + Socket.io
- **Frontend:** Vanilla HTML/CSS/JS (in `/public`)
- **Speech:** Web Speech API (Chrome/Edge only)

---

## Deploy to Railway (Free, ~2 minutes)

### Step 1 — Push to GitHub
1. Go to [github.com](https://github.com) → click **New repository**
2. Name it `speakracer`, make it public, click **Create**
3. On your computer, open Terminal in this folder and run:
```bash
git init
git add .
git commit -m "Initial SpeakRacer"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/speakracer.git
git push -u origin main
```

### Step 2 — Deploy on Railway
1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `speakracer` repo
4. Railway auto-detects Node.js and deploys it
5. Click **Settings** → **Networking** → **Generate Domain**
6. You get a URL like `speakracer-production.up.railway.app`

**That's it.** Share the URL with your friend!

---

## Deploy to Render (Also Free)

1. Go to [render.com](https://render.com) → **New Web Service**
2. Connect GitHub and select your `speakracer` repo
3. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Click **Create Web Service**
5. Wait ~2 min → get your public URL

---

## Local Development

```bash
npm install
npm start
# open http://localhost:3000
```

For live reload during dev:
```bash
npm install -g nodemon
nodemon server.js
```

---

## How It Works

1. Player A clicks **Create Room** → gets a 6-character code
2. Player A shares the code or invite link with Player B
3. Player B enters the code → joins the room
4. Player A (host) hits **Start Race**
5. Both players see a 3-2-1 countdown simultaneously
6. Both read the same passage aloud as fast as possible
7. Words light up in real-time via speech recognition
8. First to finish wins — WPM and accuracy tracked

## Notes
- **Chrome or Edge only** — Safari doesn't support Web Speech API
- Rooms support exactly 2 players
- Host can shuffle passages before starting
- Rematch button resets the room for another round
