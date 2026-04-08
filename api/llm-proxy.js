// Vercel Serverless Function — LLM Proxy
// API Key stored in Vercel environment variable, never exposed to client
export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, max_tokens = 2000, temperature = 0.9, top_p = 0.95 } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt' });
  }

  // Set CORS headers
  const allowedOrigins = [
    'https://guantu.vercel.app',
    'http://localhost:8080',
    'http://localhost:5173',
    'http://127.0.0.1:8080'
  ];
  const origin = req.headers.origin || '';
  const requestOrigin = allowedOrigins.includes(origin) ? origin : 'https://guantu.vercel.app';
  res.setHeader('Access-Control-Allow-Origin', requestOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Get API config from environment variables (clean up any encoding artifacts)
  const apiKey = (process.env.DEEPSEEK_API_KEY || '').replace(/[\x00-\x1F\x7F\uFEFF\u200B\u200C\u200D]/g, '').trim();
  const endpoint = process.env.LLM_ENDPOINT || 'https://api.deepseek.com/chat/completions';
  const model = process.env.LLM_MODEL || 'deepseek-chat';

  if (!apiKey) {
    console.error('[Proxy] DEEPSEEK_API_KEY not configured');
    return res.status(500).json({ error: 'LLM service not configured' });
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens,
        top_p
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Proxy] API error ${response.status}:`, errorText);
      return res.status(response.status).json({
        error: `LLM API error: ${response.status}`,
        details: errorText.substring(0, 200)
      });
    }

    const data = await response.json();

    // Extract content (handle reasoning models)
    const choice = data.choices?.[0]?.message;
    let text = choice?.content || choice?.reasoning_content || '';
    // Clean up reasoning tags
    text = text.replace(/<think[\s\S]*?<\/think>/gi, '').trim();
    text = text.replace(/<think[\s\S]*$/gi, '').trim();

    if (!text) {
      return res.status(502).json({ error: 'LLM returned empty content' });
    }

    return res.status(200).json({ content: text });
  } catch (err) {
    console.error('[Proxy] Fetch error:', err.message);
    return res.status(500).json({ error: 'Proxy fetch failed: ' + err.message });
  }
}
