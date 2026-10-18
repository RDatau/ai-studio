import express from 'express';

const router = express.Router();

router.use(express.raw({ type: '*/*', limit: '100mb' }));

router.all('/', async (req, res) => {
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

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOptions.duplex = 'half';
      if (Buffer.isBuffer(req.body) && req.body.length > 0) {
        fetchOptions.body = req.body;
        forwardHeaders['content-length'] = String(req.body.length);
      } else if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        fetchOptions.body = JSON.stringify(req.body);
        if (!forwardHeaders['content-type']) forwardHeaders['content-type'] = 'application/json';
        forwardHeaders['content-length'] = String(Buffer.byteLength(fetchOptions.body));
      } else if (typeof req.body === 'string' && req.body.length > 0) {
        fetchOptions.body = req.body;
        forwardHeaders['content-length'] = String(Buffer.byteLength(req.body));
      }
    }

    const upstreamResp = await fetch(targetUrl, fetchOptions);

    res.status(upstreamResp.status);
    const contentType = upstreamResp.headers.get('content-type');
    if (contentType) res.setHeader('content-type', contentType);

    if (contentType && contentType.includes('text/event-stream')) {
      res.setHeader('cache-control', 'no-cache');
      res.setHeader('connection', 'keep-alive');
      res.setHeader('content-type', 'text/event-stream; charset=utf-8');
      res.flushHeaders?.();

      if (upstreamResp.body) {
        const reader = upstreamResp.body.getReader();
        req.on('close', () => { reader.cancel().catch(() => {}); });
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
        } catch (streamErr) {
          console.warn('[HF-Proxy] Stream interrupted:', streamErr);
        } finally {
          res.end();
        }
        return;
      }
    }

    const arrayBuffer = await upstreamResp.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));

  } catch (err: any) {
    console.error('[HF-Proxy Error]', err);
    res.status(502).json({ error: 'Proxy to Hugging Face Space failed', message: err?.message || String(err) });
  }
});

export default router;
