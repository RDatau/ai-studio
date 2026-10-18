import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rawTargetUrl = (req.query.url as string) || (req.headers['x-target-url'] as string);
  if (!rawTargetUrl) {
    return res.status(400).json({ error: 'Missing target URL in query or x-target-url header' });
  }

  try {
    let targetUrl = rawTargetUrl.trim();
    try {
      new URL(targetUrl);
    } catch {
      targetUrl = decodeURIComponent(rawTargetUrl).trim();
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      return res.status(400).json({ error: `URL target tidak valid: "${targetUrl}"` });
    }

    if (!parsedUrl.protocol.startsWith('http') || !parsedUrl.hostname) {
      return res.status(400).json({ error: 'Hostname URL target tidak valid.' });
    }

    const forwardHeaders: Record<string, string> = {};
    if (req.headers['authorization']) forwardHeaders['authorization'] = req.headers['authorization'] as string;
    if (req.headers['content-type']) forwardHeaders['content-type'] = req.headers['content-type'] as string;
    if (req.headers['accept']) forwardHeaders['accept'] = req.headers['accept'] as string;

    const fetchOptions: any = {
      method: req.method,
      headers: forwardHeaders,
      redirect: 'follow',
    };

    // Body handling for Vercel
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        fetchOptions.body = req.body;
        if (req.headers['content-length']) forwardHeaders['content-length'] = req.headers['content-length'] as string;
    }

    const upstreamResp = await fetch(targetUrl, fetchOptions);

    res.status(upstreamResp.status);
    const contentType = upstreamResp.headers.get('content-type');
    if (contentType) res.setHeader('content-type', contentType);

    const arrayBuffer = await upstreamResp.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));

  } catch (err: any) {
    console.error('[HF-Proxy Error]', err);
    res.status(502).json({ error: 'Proxy to Hugging Face Space failed', message: err?.message || String(err) });
  }
}
