# Solus Chat Assistant — Setup

## 1. Rotate your API key first
You pasted a key in chat earlier — go to console.anthropic.com → API Keys, revoke it, and generate a fresh one. Use only the new one below.

## 2. Deploy the backend to Railway
1. Push the `solus-chat-backend` folder to a new GitHub repo.
2. In Railway: New Project → Deploy from GitHub repo → select it.
3. In Railway's Variables tab, add:
   - `ANTHROPIC_API_KEY` = your new key
   - `ALLOWED_ORIGIN` = your Solus site URL (e.g. `https://yourusername.github.io`)
4. Railway auto-detects Node and runs `npm start`. Once deployed, copy the public URL Railway gives you (e.g. `https://solus-chat-backend-production.up.railway.app`).
5. Test it's alive: visit `https://your-railway-url/health` — should return `{"status":"ok"}`.

## 3. Wire up the frontend
1. Open `solus-chat-widget.html`.
2. Replace `BACKEND_URL` with `https://your-railway-url/api/chat`.
3. Paste the entire contents of that file into your Solus `index.html`, right before `</body>`.
4. Commit and push to GitHub Pages.

## 4. Test it
Open your live Solus site, click the chat bubble bottom-right, send a message. It should reply using Claude within a few seconds.

## Customizing the assistant
Edit the `SYSTEM_PROMPT` constant in `server.js` — that's what tells Claude how to behave, what it knows about Solus, and its tone. Update it with real details: return policy, shipping times, sizing info, etc. The more specific you make it, the better the answers.

## Cost control
- Rate limiting is built in (15 messages/min per IP) to prevent abuse of your API key.
- Uses `claude-sonnet-5` — change to `claude-haiku-4-5` in `server.js` if you want cheaper/faster responses for a support bot (usually plenty capable for this use case).
- Monitor usage/spend at console.anthropic.com.

## Security notes
- Never put your API key in frontend code — it must live only in Railway's environment variables.
- `ALLOWED_ORIGIN` restricts which domains can call your backend; don't leave it as `*` in production.
