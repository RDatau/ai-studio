import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { enhancePrompt, validateApiKey } from './src/services/geminiClientService.ts';
import { testToken } from './src/services/hfBackendService.ts';
import hfProxyRouter from './src/api/hf-proxy.ts';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(express.json({ limit: '50mb' }));

// API Routes
app.post('/api/test-token', async (req, res) => {
  const { token } = req.body;
  const result = await testToken(token);
  return res.json(result);
});

app.post('/api/enhance-prompt', async (req, res) => {
  try {
    const { prompt, keys, image } = req.body;
    const result = await enhancePrompt(prompt, keys, image);
    return res.json(result);
  } catch (err: any) {
    console.error('Prompt enhancement error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Prompt enhancement failed' });
  }
});

app.post('/api/validate-gemini-key', async (req, res) => {
  try {
    const { apiKey } = req.body;
    const result = await validateApiKey(apiKey);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ valid: false, message: err.message });
  }
});

// Mount modular HF Proxy router
app.use('/api/hf-proxy', hfProxyRouter);

// Setup Vite middleware in development or static serving in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
