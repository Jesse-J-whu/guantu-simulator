// Vercel Edge Middleware — proxies LLM requests to DeepSeek
// This file intercepts /api/llm-proxy requests on the edge
export const config = {
  matcher: '/api/llm-proxy'
};

export default async function middleware(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': request.headers.get('origin') || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const body = await request.json();
  const { prompt, max_tokens = 2000, temperature = 0.9, top_p = 0.95 } = body;

  if (!prompt) {
    return new Response(JSON.stringify({ error: 'Missing prompt' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  const endpoint = process.env.LLM_ENDPOINT || 'https://api.deepseek.com/chat/completions';
  const model = process.env.LLM_MODEL || 'deepseek-chat';

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'LLM service not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
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
      return new Response(JSON.stringify({
        error: `LLM API error: ${response.status}`,
        details: errorText.substring(0, 200)
      }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();
    const choice = data.choices?.[0]?.message;
    let text = choice?.content || choice?.reasoning_content || '';
    text = text.replace(/<think[\s\S]*?<\/think>/gi, '').trim();
    text = text.replace(/<think[\s\S]*$/gi, '').trim();

    if (!text) {
      return new Response(JSON.stringify({ error: 'LLM returned empty content' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ content: text }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': request.headers.get('origin') || '*'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Proxy fetch failed: ' + err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
