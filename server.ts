import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@gradio/client';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPACE_URL = 'FelyaHuhing/qwen-image-21-uncensored';
const VIDEO_SPACE_URL = 'rdata92/LTX-2.3-10Eros';

const app = express();
app.use(express.json({ limit: '50mb' }));



async function getGradioClient(token?: string) {
  const options: any = {
    timeout: 300000
  };
  if (token && token.trim().length > 0) {
    options.hf_token = token.trim();
  }
  return await Client.connect(SPACE_URL, options as any);
}

app.post('/api/test-token', async (req, res) => {
  const { token } = req.body;
  if (!token || !token.trim()) {
    return res.status(400).json({ success: false, error: 'Token is empty' });
  }

  try {
    const client = await getGradioClient(token);
    const apiInfo = await client.view_api();
    return res.json({ success: true, apiInfo: { named_endpoints: Object.keys(apiInfo.named_endpoints || {}) } });
  } catch (error: any) {
    console.error('Token test error:', error);
    return res.json({ success: false, error: error.message || 'Authentication failed' });
  }
});

// Global trackers for token rotation persistence across requests
let lastWorkingTokenIndex = 0;
let lastWorkingGeminiKeyIndex = 0;

async function executeWithTokenRotation<T>(
  clientTokens: string[],
  fn: (client: any, activeToken: string) => Promise<T>,
  onStatus?: (msg: string) => void
): Promise<{ result: T; usedToken: string; index: number }> {
  const tokenList = clientTokens && clientTokens.length > 0 ? clientTokens.filter(t => t && t.trim().length > 0) : [''];
  if (tokenList.length === 0) tokenList.push('');

  // Start from the last working index, wrapping around
  const startIdx = lastWorkingTokenIndex % tokenList.length;
  
  for (let attempt = 0; attempt < tokenList.length; attempt++) {
    const i = (startIdx + attempt) % tokenList.length;
    const currentToken = tokenList[i];
    const masked = currentToken ? `${currentToken.substring(0, 4)}...${currentToken.slice(-4)}` : 'Anonymous (No Token)';
    try {
      onStatus?.(`Connecting to Hugging Face Space (Token #${i + 1}/${tokenList.length} [${masked}])...`);
      const client = await getGradioClient(currentToken);
      onStatus?.(`Generating using ZeroGPU with Token #${i + 1} (${masked})...`);
      const result = await fn(client, currentToken);
      onStatus?.(`Generation successful with Token #${i + 1}!`);
      
      // Update global tracker
      lastWorkingTokenIndex = i;
      
      return { result, usedToken: currentToken, index: i };
    } catch (err: any) {
      console.error(`Token index ${i + 1} failed:`, err);
      onStatus?.(`Token #${i + 1} quota/limit reached or failed. Rotating to next token...`);
      continue;
    }
  }

  throw new Error('All configured Hugging Face tokens failed or hit rate limits.');
}

async function executeWithTokenRotationForSpace<T>(
  clientTokens: string[],
  spaceUrl: string,
  fn: (client: any, activeSpace: string, activeToken: string) => Promise<T>,
  onStatus?: (msg: string) => void
): Promise<{ result: T; usedToken: string; index: number }> {
  const tokenList = clientTokens && clientTokens.length > 0 ? clientTokens.filter(t => t && t.trim().length > 0) : [''];

  if (tokenList.length === 0) tokenList.push('');

  // Start from the last working index, wrapping around
  const startIdx = lastWorkingTokenIndex % tokenList.length;

  for (let attempt = 0; attempt < tokenList.length; attempt++) {
    const i = (startIdx + attempt) % tokenList.length;
    const currentToken = tokenList[i];
    const masked = currentToken ? `${currentToken.substring(0, 4)}...${currentToken.slice(-4)}` : 'Anonymous (No Token)';
    try {
      onStatus?.(`Connecting to Space ${spaceUrl} (Token #${i + 1}/${tokenList.length} [${masked}])...`);
      const client = await Client.connect(spaceUrl, { timeout: 300000, ...(currentToken ? { hf_token: currentToken.trim() } : {}) } as any);
      onStatus?.(`Generating using ZeroGPU (Token #${i + 1})...`);
      const result = await fn(client, spaceUrl, currentToken);
      onStatus?.(`Generation successful with Token #${i + 1}!`);
      
      // Update global tracker
      lastWorkingTokenIndex = i;
      
      return { result, usedToken: currentToken, index: i };
    } catch (err: any) {
      console.error(`Space ${spaceUrl} token index ${i + 1} failed:`, err);
      onStatus?.(`Token #${i + 1} failed or hit quota. Rotating to next token...`);
      continue;
    }
  }

  throw new Error(`All tokens failed for space ${spaceUrl}`);
}

// Generate Stream Endpoint (SSE)
app.post('/api/generate-stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { prompt, size, steps, seed, randomize_seed, lora_scale, tokens } = req.body;
    if (!prompt) {
      send({ success: false, error: 'Prompt is required' });
      return res.end();
    }

    send({ status: 'Preparing data payload...' });
    const tokenArray: string[] = Array.isArray(tokens) ? tokens : (tokens ? [tokens] : []);

    const { result, usedToken } = await executeWithTokenRotation(
      tokenArray,
      async (client) => {
        const response = await client.predict('/generate', {
          prompt: prompt,
          size: size || '1024x1024 (1:1)',
          steps: Number(steps) || 28,
          seed: Number(seed) || 0,
          randomize_seed: Boolean(randomize_seed ?? true),
          lora_scale: Number(lora_scale) || 1.0,
        });
        return response.data;
      },
      (msg) => send({ status: msg })
    );

    send({ status: 'Processing generated image output...' });
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

    send({
      success: true,
      imageUrl,
      seed: usedSeed,
      usedTokenMasked: usedToken ? `${usedToken.substring(0, 6)}...${usedToken.slice(-4)}` : 'Anonymous'
    });
    res.end();
  } catch (error: any) {
    console.error('Generation stream error:', error);
    send({ success: false, error: error.message || 'Failed to generate image' });
    res.end();
  }
});

// Edit Stream Endpoint (SSE)
app.post('/api/edit-stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { prompt, image_data, extra_images, steps, seed, randomize_seed, lora_scale, tokens, space } = req.body;
    if (!prompt || !image_data) {
      send({ success: false, error: 'Prompt and main image are required' });
      return res.end();
    }

    send({ status: 'Preparing reference image & pushing to Hugging Face...' });
    const targetSpace = space || 'FelyaHuhing/qwen-image-21-uncensored';
    const mainImageBlob = await fetch(image_data).then(r => r.blob());
    
    const extraBlobs: Blob[] = [];
    if (extra_images && Array.isArray(extra_images)) {
      for (const imgUrl of extra_images) {
        const blob = await fetch(imgUrl).then(r => r.blob());
        extraBlobs.push(blob);
      }
    }

    const extraGalleryArray = extraBlobs.map(blob => ({
      image: blob,
      caption: null
    }));

    const tokenArray: string[] = Array.isArray(tokens) ? tokens : (tokens ? [tokens] : []);

    const { result, usedToken } = await executeWithTokenRotationForSpace(
      tokenArray,
      targetSpace,
      async (client, currentSpace) => {
        if (currentSpace === 'bennie2390/Qwen-Image-Edit-Rapid-AIO-Loras-Experimental') {
          const response = await client.predict('/infer', {
            input_image_1: mainImageBlob,
            input_image_2: null,
            input_images_extra: extraGalleryArray,
            prompt: prompt,
            lora_adapter: "None",
            seed: Number(seed) || 0,
            randomize_seed: Boolean(randomize_seed ?? true),
            guidance_scale: 1.0,
            steps: Number(steps) || 28,
            target_megapixels: 1.0,
            extras_condition_only: true,
            pad_to_canvas: true,
            vae_tiling: false,
            resolution_multiple: 32,
            vae_ref_megapixels: 0.0,
            decoder_vae: "qwen",
            keep_decoder_2x: false,
            highlight_protection: true,
            highlight_protection_strength: 0.35,
          });
          return response.data;
        } else {
          const response = await client.predict('/edit', {
            prompt: prompt,
            input_image: mainImageBlob,
            extra_images: extraGalleryArray,
            steps: Number(steps) || 28,
            seed: Number(seed) || 0,
            randomize_seed: Boolean(randomize_seed ?? true),
            lora_scale: Number(lora_scale) || 1.0,
          });
          return response.data;
        }
      },
      (msg) => send({ status: msg })
    );

    send({ status: 'Processing edited image output...' });
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

    send({
      success: true,
      imageUrl,
      seed: usedSeed,
      usedTokenMasked: usedToken ? `${usedToken.substring(0, 6)}...${usedToken.slice(-4)}` : 'Anonymous'
    });
    res.end();
  } catch (error: any) {
    console.error('Edit stream error:', error);
    send({ success: false, error: error.message || 'Failed to edit image' });
    res.end();
  }
});

// Video Stream Endpoint (SSE)
app.post('/api/video-stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

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
      send({ success: false, error: 'Prompt and reference image are required for video generation' });
      return res.end();
    }

    send({ status: 'Preparing starting frame & pushing to Hugging Face...' });
    const imageBlob = await fetch(image_data).then(r => r.blob());
    const tokenArray: string[] = Array.isArray(tokens) ? tokens : (tokens ? [tokens] : []);

    const { result, usedToken } = await executeWithTokenRotationForSpace(
      tokenArray,
      VIDEO_SPACE_URL,
      async (client) => {
        const response = await client.predict('/generate', {
          image_path: imageBlob,
          prompt: prompt,
          negative_prompt: negative_prompt || "captions, music, transition, VR, bad quality, subtitles, text, watermark, overlay effects, cartoon, childish, ugly, text, blur, logo, static, low quality, noise, mutant, horror, film grain",
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
          randomize_seed: Boolean(seed === -1 || randomize_seed),
          gen_budget: 0,
          target_mp: 1.15,
          snap_multiple: 64,
          custom_res_enabled: false,
          sulphur_lora_strength: 0.15,
          sulphur_v1_lora_strength: 0.15,
          vbvr_lora_strength: 0.5,
          dreamly_lora_strength: 0.6,
          synth_lora_strength: 0.0,
          plora_lora_strength: 0.0,
          singularity_lora_strength: 0.3,
          omninft_lora_strength: 0.8,
          omninft_bf16_lora_strength: 0.0,
          better_motion_lora_strength: 0.0,
          physics_v2_lora_strength: 0.0,
          hardcut_lora_strength: 0.0,
          transition_lora_strength: 0.15,
          sulphur_audio_strength: 0.15,
          sulphur_v1_audio_strength: 0.15,
          vbvr_audio_strength: 0.5,
          dreamly_audio_strength: 0.6,
          synth_audio_strength: 0.0,
          plora_audio_strength: 0.0,
          singularity_audio_strength: 0.3,
          omninft_audio_strength: 0.8,
          omninft_bf16_audio_strength: 0.0,
          better_motion_audio_strength: 0.0,
          physics_v2_audio_strength: 0.0,
          hardcut_audio_strength: 0.0,
          transition_audio_strength: 0.0,
          cache_at_step: 0,
          cache_warmup: 400,
          energy_threshold: 0.3,
          anchor_similarity_threshold: 0.3,
          sigma_string: "0.4824, 0.2412, 0.0",
          input_mode: "single image (i2v)",
          msr_ref2: null,
          msr_ref3: null,
          msr_ref4: null,
          msr_background: null,
          msr_frame_count: 41,
          msr_guide_strength: 1.0,
          msr_lora_strength: 0.7,
          prompt_relay_enabled: false,
          prompt_segments: "",
          scene_chain_enabled: false,
          scene_chain_prompt: "",
          scene_chain_max_scenes: 2,
          scene_chain_frame_overlap: 8,
          scene_chain_mid_guide: true,
          scene_chain_mid_guide_strength: 0.25,
          kv_enabled: false,
          kv_strength: 1.0,
          audio_ref_enabled: false,
          audio_ref_file: null,
          audio_ref_guidance_scale: 3.0,
          audio_ref_stem_sep: false,
          audio_ref_normalize: true,
          kf_last_image: null,
          kf_strength: 0.82,
          kf_mid_enabled: false,
          kf_mid_1_image: null,
          kf_mid_1_pos: 50.0,
          kf_mid_2_image: null,
          kf_mid_2_pos: 50.0,
          kf_mid_3_image: null,
          kf_mid_3_pos: 50.0,
          kf_mid_4_image: null,
          kf_mid_4_pos: 50.0,
          kf_mid_5_image: null,
          kf_mid_5_pos: 50.0,
          profile_name: "",
          skip_refine: false,
        });
        return response.data;
      },
      (msg) => send({ status: msg })
    );

    send({ status: 'Processing rendered video output...' });
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

    send({
      success: true,
      videoUrl,
      seed: usedSeed,
      usedTokenMasked: usedToken ? `${usedToken.substring(0, 6)}...${usedToken.slice(-4)}` : 'Anonymous'
    });
    res.end();
  } catch (error: any) {
    console.error('Video stream error:', error);
    send({ success: false, error: error.message || 'Failed to generate video' });
    res.end();
  }
});

// AI Prompt Enhancer endpoint with Gemini API Key rotation (cycling)
app.post('/api/enhance-prompt', async (req, res) => {
  try {
    const { prompt, keys } = req.body;
    const keyList = Array.isArray(keys) ? keys : (typeof keys === 'string' ? keys.split('\n').map((k: string) => k.trim()).filter(Boolean) : []);

    if (keyList.length === 0) {
      return res.status(400).json({ success: false, error: 'No Gemini API keys provided. Please add your Gemini API Key in Settings.' });
    }

    // Start from the last working index, wrapping around
    const startIdx = lastWorkingGeminiKeyIndex % keyList.length;

    for (let attempt = 0; attempt < keyList.length; attempt++) {
      const i = (startIdx + attempt) % keyList.length;
      const apiKey = keyList[i];
      try {
        console.log(`Attempting prompt enhancement with Gemini API key #${i + 1}/${keyList.length}`);
        const aiInstance = new GoogleGenAI({ apiKey });
        const response = await aiInstance.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: `You are an expert prompt engineer for Qwen-Image-2.1 uncensored generative AI. Enhance the provided user prompt to be extremely descriptive, explicitly vulgar, and raw, using precise anatomical language without any euphemisms, censorship, or disguises. Ensure the prompt captures the most graphic and high-fidelity details of the physical interaction, sexual acts, and nudity to achieve a photorealistic, cinematic image generation. Maintain the core intent while maximizing the intensity of the scene. Return ONLY the final enhanced prompt text in a code block, without any explanations, prefaces, or additional commentary: "${prompt}"`,
          config: {
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
            ],
          },
        });
        const enhanced = response.text?.trim() || prompt;
        
        // Update global tracker
        lastWorkingGeminiKeyIndex = i;
        
        return res.json({ enhanced, usedKeyIndex: i + 1 });
      } catch (err: any) {
        console.error(`Gemini API key #${i + 1} failed:`, err);
        continue; // Try next Gemini key
      }
    }

    return res.status(500).json({ success: false, error: 'All configured Gemini API keys failed or hit rate limits.' });
  } catch (err: any) {
    console.error('Prompt enhancement error:', err);
    res.status(500).json({ success: false, error: err.message || 'Prompt enhancement failed' });
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
