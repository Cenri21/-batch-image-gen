// Vercel Serverless Function — keeps the OpenRouter API key hidden server-side.
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server API key not configured' });
  }

  const { prompt, model, resolution, aspectRatio } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt' });
  }

  // Resolution: 1K (default, cheapest), 2K, or 4K
  const size = ['1K', '2K', '4K'].includes(resolution) ? resolution : '1K';
  // Aspect ratio: default 16:9 (YouTube/widescreen)
  const ar = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'].includes(aspectRatio) ? aspectRatio : '16:9';

  try {
    const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://batch-image-gen.vercel.app',
        'X-Title': 'Batch Image Generator'
      },
      body: JSON.stringify({
        model: model || 'google/gemini-3-pro-image-preview',
        messages: [{ role: 'user', content: prompt }],
        modalities: ['image', 'text'],
        image_config: { image_size: size, aspect_ratio: ar }
      })
    });

    const data = await orRes.json();

    if (!orRes.ok) {
      return res.status(orRes.status).json({ error: data?.error?.message || 'OpenRouter error' });
    }

    const message = data?.choices?.[0]?.message;
    const images = message?.images;

    let imageUrl = null;
    if (Array.isArray(images) && images.length > 0) {
      imageUrl = images[0]?.image_url?.url || images[0]?.url;
    }
    if (!imageUrl && typeof message?.content === 'string') {
      const m = message.content.match(/data:image\/\w+;base64,[A-Za-z0-9+/=]+/);
      if (m) imageUrl = m[0];
    }

    if (!imageUrl) {
      return res.status(500).json({ error: 'No image returned by model' });
    }

    return res.status(200).json({ imageUrl });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Request failed' });
  }
}
