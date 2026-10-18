import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@gradio/client';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPACE_URL = 'vclnhihihi/qwen-image-21-uncensored';

const app = express();
app.use(express.json({ limit: '50mb' }));

// Initialize Google GenAI client if GEMINI_API_KEY is available (for prompt enhancement feature)
const geminiApiKey = process.env.GEMINI_API_KEY;
const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

// Helper to create Gradio client with optional token
async function getGradioClient(token?: string) {
  const options: any = {};
  if (token && token.trim().length > 0) {
    options.hf_token = token.trim();
  }
  return await Client.connect(SPACE_URL, options);
}

// Test token validity endpoint
app.post('/api/test-token', async (req, res) => {
  const { token } = req.body;
  if (!token || !token.trim()) {
    return res.status(400).json({ success: false, error: 'Token is empty' });
  }

  try {
    // Test connection to the Space with the provided token
    const client = await getGradioClient(token);
    // Try to get service status or api info
    const apiInfo = await client.view_api();
    return res.json({ success: true, apiInfo: { named_endpoints: Object.keys(apiInfo.named_endpoints || {}) } });
  } catch (error: any) {
    console.error('Token test error:', error);
    return res.json({ success: false, error: error.message || 'Authentication failed' });
  }
});

// Helper for rotating token execution
async function executeWithTokenRotation<T>(
  tokens: string[],
  fn: (client: any, activeToken: string) => Promise<T>
): Promise<{ result: T; usedToken: string }> {
  // If no tokens provided, try with empty token (anonymous)
  const tokenList = tokens && tokens.length > 0 ? tokens.filter(t => t && t.trim().length > 0) : [''];
  if (tokenList.length === 0) tokenList.push('');

  let lastError: any = null;

  for (let i = 0; i < tokenList.length; i++) {
    const currentToken = tokenList[i];
    try {
      console.log(`Attempting connection with token index ${i + 1}/${tokenList.length} (${currentToken ? 'Custom Token' : 'Anonymous'})`);
      const client = await getGradioClient(currentToken);
      const result = await fn(client, currentToken);
      return { result, usedToken: currentToken };
    } catch (err: any) {
      console.warn(`Token index ${i + 1} failed:`, err.message || err);
      lastError = err;
      // If error is authentication/quota/rate limit or connection error, try next token
      continue;
    }
  }

  throw lastError || new Error('All configured Hugging Face tokens failed or hit rate limits.');
}

// Generate Endpoint
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, size, steps, seed, randomize_seed, lora_scale, tokens } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const tokenArray: string[] = Array.isArray(tokens) ? tokens : (tokens ? [tokens] : []);

    const { result, usedToken } = await executeWithTokenRotation(tokenArray, async (client) => {
      // Based on app.py: generate(prompt, size, steps, seed, randomize_seed, lora_scale)
      // returns [image, seed]
      const response = await client.predict('/generate', {
        prompt: prompt,
        size: size || '1024x1024 (1:1)',
        steps: Number(steps) || 28,
        seed: Number(seed) || 0,
        randomize_seed: Boolean(randomize_seed ?? true),
        lora_scale: Number(lora_scale) || 1.0,
      });

      return response.data;
    });

    // Gradio client returns data array: [ { url, path, ... }, seed ]
    const outputData = result;
    let imageUrl = '';
    let usedSeed = seed;

    if (Array.isArray(outputData)) {
      const imgObj = outputData[0];
      if (imgObj && imgObj.url) {
        imageUrl = imgObj.url;
      } else if (imgObj && imgObj.path) {
        imageUrl = imgObj.path;
      }
      if (outputData.length > 1) {
        usedSeed = outputData[1];
      }
    }

    res.json({
      success: true,
      imageUrl,
      seed: usedSeed,
      usedTokenMasked: usedToken ? `${usedToken.substring(0, 6)}...${usedToken.slice(-4)}` : 'Anonymous'
    });
  } catch (error: any) {
    console.error('Generation error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to generate image via Hugging Face Space' });
  }
});

// Edit Endpoint
app.post('/api/edit', async (req, res) => {
  try {
    const { prompt, image_data, extra_images, steps, seed, randomize_seed, lora_scale, tokens } = req.body;

    if (!prompt || !image_data) {
      return res.status(400).json({ error: 'Prompt and main image are required' });
    }

    // Convert base64 image or url to Blob/File for gradio client
    const mainImageBlob = await fetch(image_data).then(r => r.blob());
    
    const extraBlobs = [];
    if (extra_images && Array.isArray(extra_images)) {
      for (const imgUrl of extra_images) {
        const blob = await fetch(imgUrl).then(r => r.blob());
        extraBlobs.push(blob);
      }
    }

    const tokenArray: string[] = Array.isArray(tokens) ? tokens : (tokens ? [tokens] : []);

    const { result, usedToken } = await executeWithTokenRotation(tokenArray, async (client) => {
      // edit(prompt, input_image, extra_images, steps, seed, randomize_seed, lora_scale)
      const response = await client.predict('/edit', {
        prompt: prompt,
        input_image: mainImageBlob,
        extra_images: extraBlobs,
        steps: Number(steps) || 28,
        seed: Number(seed) || 0,
        randomize_seed: Boolean(randomize_seed ?? true),
        lora_scale: Number(lora_scale) || 1.0,
      });

      return response.data;
    });

    const outputData = result;
    let imageUrl = '';
    let usedSeed = seed;

    if (Array.isArray(outputData)) {
      const imgObj = outputData[0];
      if (imgObj && imgObj.url) {
        imageUrl = imgObj.url;
      } else if (imgObj && imgObj.path) {
        imageUrl = imgObj.path;
      }
      if (outputData.length > 1) {
        usedSeed = outputData[1];
      }
    }

    res.json({
      success: true,
      imageUrl,
      seed: usedSeed,
      usedTokenMasked: usedToken ? `${usedToken.substring(0, 6)}...${usedToken.slice(-4)}` : 'Anonymous'
    });
  } catch (error: any) {
    console.error('Edit error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to edit image via Hugging Face Space' });
  }
});

// Optional AI Prompt Enhancer endpoint using Google GenAI if available
app.post('/api/enhance-prompt', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!ai) {
      return res.json({ enhanced: prompt });
    }
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are an expert prompt engineer for Qwen-Image-2.1 uncensored generative AI. Enhance this prompt to be extremely descriptive, high-quality, artistic, and detailed for high-fidelity image generation, while maintaining the user's core intent. Return ONLY the enhanced prompt text without explanations: "${prompt}"`,
    });
    const enhanced = response.text?.trim() || prompt;
    res.json({ enhanced });
  } catch (err: any) {
    console.error('Prompt enhancement error:', err);
    res.json({ enhanced: req.body.prompt });
  }
});

// LTX 2.3 10Eros Image-to-Video Generation Endpoint
const VIDEO_SPACE_URL = 'rdata92/LTX-2.3-10Eros';

app.post('/api/video-generate', async (req, res) => {
  try {
    const {
      image_data,
      prompt,
      negative_prompt,
      preset,
      seconds,
      max_width,
      max_height,
      mode,
      face_bbox,
      likeness_strength,
      likeness_anchor_strength,
      latent_anchor_strength,
      first_frame_strength,
      seed,
      randomize_seed,
      tokens
    } = req.body;

    if (!prompt || !image_data) {
      return res.status(400).json({ error: 'Prompt and reference image are required for video generation' });
    }

    const imageBlob = await fetch(image_data).then(r => r.blob());
    const tokenArray: string[] = Array.isArray(tokens) ? tokens : (tokens ? [tokens] : []);

    const { result, usedToken } = await executeWithTokenRotation(tokenArray, async (client) => {
      const response = await client.predict('/generate', {
        image_path: imageBlob,
        prompt: prompt,
        negative_prompt: negative_prompt || "bad quality, static, low quality",
        preset: preset || "tuned",
        seconds: Number(seconds) || 4.0,
        max_width: Number(max_width) || 1120,
        max_height: Number(max_height) || 1344,
        mode: mode || "anchor only",
        face_bbox: face_bbox || "",
        likeness_strength: Number(likeness_strength ?? 0.9),
        likeness_anchor_strength: Number(likeness_anchor_strength ?? 0.15),
        latent_anchor_strength: Number(latent_anchor_strength ?? 0.08),
        first_frame_strength: Number(first_frame_strength ?? 0.82),
        seed: Number(seed ?? -1),
        randomize_seed: Boolean(randomize_seed ?? true),
      });

      return response.data;
    });

    const outputData = result;
    let videoUrl = '';
    let usedSeed = seed;

    if (Array.isArray(outputData)) {
      const vidObj = outputData[0];
      if (vidObj && vidObj.url) {
        videoUrl = vidObj.url;
      } else if (vidObj && vidObj.path) {
        videoUrl = vidObj.path;
      }
      if (outputData.length > 2) {
        usedSeed = outputData[2];
      }
    }

    res.json({
      success: true,
      videoUrl,
      seed: usedSeed,
      usedTokenMasked: usedToken ? `${usedToken.substring(0, 6)}...${usedToken.slice(-4)}` : 'Anonymous'
    });
  } catch (error: any) {
    console.error('Video generation error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to generate video via Hugging Face Space LTX-2.3-10Eros' });
  }
});

// Setup Vite middleware in development
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
