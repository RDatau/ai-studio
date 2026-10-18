import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Client } from '@gradio/client';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  
  const { prompt, image_data, tokens } = req.body;
  const tokenList = Array.isArray(tokens) ? tokens : (tokens ? [tokens] : ['']);
  const startIndex = (Number(req.body.lastWorkingIndex) || 0) % tokenList.length;
  
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
  
    const send = (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  
    try {
      const imageBlob = await fetch(image_data).then(r => r.blob());
  
      for (let attempt = 0; attempt < tokenList.length; attempt++) {
        const i = (startIndex + attempt) % tokenList.length;
          const token = tokenList[i];
          console.log(`Attempting video generation with token #${i} (starts with ${token.substring(0, 4)}...)`);
          try {
            const client = await Client.connect('rdata92/LTX-2.3-10Eros', {
              timeout: 300000,
              ...(token.trim() ? { hf_token: token.trim() } : {})
            } as any);
            console.log(`Successfully connected to space with token #${i}`);
            
            const response = await client.predict('/generate', {
            image_path: imageBlob,
            prompt: prompt,
            negative_prompt: req.body.negative_prompt || "captions, music, transition, VR, bad quality, subtitles, text, watermark, overlay effects, cartoon, childish, ugly, text, blur, logo, static, low quality, noise, mutant, horror, film grain",
            preset: req.body.preset || "tuned",
            seconds: Number(req.body.seconds) || 4.0,
            max_width: Number(req.body.max_width) || 1120,
            max_height: Number(req.body.max_height) || 1344,
            mode: req.body.mode || "anchor only",
            face_bbox: req.body.face_bbox || "",
            likeness_strength: Number(req.body.likeness_strength ?? 0.9),
            likeness_anchor_strength: Number(req.body.likeness_anchor_strength ?? 0.15),
            latent_anchor_strength: Number(req.body.latent_anchor_strength ?? 0.08),
            first_frame_strength: Number(req.body.first_frame_strength ?? 0.82),
            seed: Number(req.body.seed ?? -1),
            randomize_seed: Boolean(req.body.seed == -1 || req.body.randomize_seed),
            prompt_segments: req.body.prompt_segments || "",
            scene_chain_prompt: req.body.scene_chain_prompt || "",
            scene_chain_enabled: req.body.scene_chain_enabled || false,
            profile_name: req.body.profile_name || "",
            kv_enabled: req.body.kv_enabled || false,
            kv_strength: Number(req.body.kv_strength ?? 1.0),
            audio_ref_enabled: req.body.audio_ref_enabled || false,
            // ... (keeping other parameters at default or as in server.ts if needed)
          });
          
          const outputData = response.data as any[];
          send({ 
            success: true, 
            videoUrl: outputData[0]?.url || outputData[0]?.path,
            seed: outputData.length > 2 ? outputData[2] : req.body.seed,
            usedIndex: i
          });
          return res.end();
        } catch (e) { continue; }
      }
      throw new Error('All tokens failed');
    } catch (e: any) {
      console.error('Video generation error:', e);
      send({ success: false, error: e.message || 'Failed to generate video' });
      res.end();
    }
  }
