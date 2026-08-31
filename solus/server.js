require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*'; // set this to your Solus domain in production

if (!ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY is not set. Add it in your environment variables.');
  process.exit(1);
}

app.use(express.json());
app.use(cors({
  origin: ALLOWED_ORIGIN === '*' ? '*' : ALLOWED_ORIGIN.split(',').map(o => o.trim()),
}));

// --- Simple in-memory rate limiter (per IP) ---
// Prevents abuse of your API key since this endpoint is public-facing.
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 15;

function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, windowStart: now };

  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }

  entry.count += 1;
  rateLimitMap.set(ip, entry);

  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({ error: 'Too many requests. Please slow down and try again shortly.' });
  }

  next();
}

// Clean up old entries periodically so the map doesn't grow forever
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 5) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

// --- System prompt: customize this to describe Solus and how the assistant should behave ---
const SYSTEM_PROMPT = `You are the customer support assistant for Solus, an online fashion and drinkware store.

Your job:
- Answer questions about products, sizing, materials, shipping, returns, and order status in a friendly, concise way.
- If you don't know something specific (like a real order status, exact stock levels, or a policy detail you're not given), say so honestly and suggest the customer contact human support or check their account, rather than guessing.
- Keep responses short and conversational — this is a chat widget, not an essay.
- Encourage purchases naturally but never be pushy or make up discounts/promotions that don't exist.
- Stay strictly on topic: Solus products, orders, and shopping help. Politely decline unrelated requests.

You do not have access to live order data unless it's explicitly provided to you in the conversation.`;

app.post('/api/chat', rateLimit, async (req, res) => {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    // Basic validation/sanitization of message shape
    const cleanMessages = messages
      .filter(m => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
      .map(m => ({ role: m.role, content: m.content.slice(0, 4000) })) // cap message length
      .slice(-20); // cap conversation history sent per request

    if (cleanMessages.length === 0) {
      return res.status(400).json({ error: 'No valid messages provided' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: cleanMessages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', response.status, errText);
      return res.status(502).json({ error: 'Chat service is temporarily unavailable. Please try again.' });
    }

    const data = await response.json();
    const replyText = data.content
      ?.filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n') || "Sorry, I couldn't generate a response. Please try again.";

    res.json({ reply: replyText });
  } catch (err) {
    console.error('Chat endpoint error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Solus chat backend running on port ${PORT}`);
});
