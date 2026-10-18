import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Client } from '@gradio/client';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  
  const { prompt, image_data, tokens, space } = req.body;
  const tokenList = Array.isArray(tokens) ? tokens : (tokens ? [tokens] : ['']);
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const mainImageBlob = await fetch(image_data).then(r => r.blob());

    for (const token of tokenList) {
      try {
        const client = await Client.connect(space || 'FelyaHuhing/qwen-image-21-uncensored', {
          timeout: 300000,
          ...(token.trim() ? { hf_token: token.trim() } : {})
        } as any);
        console.log(`Connected to space: ${space || 'FelyaHuhing/qwen-image-21-uncensored'}`);
        
        // Setup progress streaming
        const app = client.submit(space === 'bennie2390/Qwen-Image-Edit-Rapid-AIO-Loras-Experimental' ? '/infer' : '/edit', {
            ...(space === 'bennie2390/Qwen-Image-Edit-Rapid-AIO-Loras-Experimental' ? {
                input_image_1: mainImageBlob,
                input_image_2: null,
                input_images_extra: [],
                prompt,
                lora_adapter: "None",
                seed: 0,
                randomize_seed: true,
                guidance_scale: 1.0,
                steps: 28,
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
            } : {
                prompt, input_image: mainImageBlob
            })
        });

        app.on('status', (status: any) => {
            console.log('Progress:', status);
            send({ status: status.stage === 'pending' ? 'Queued' : `Processing: ${status.stage}` });
        });

        const result = await app;
        
        console.log('Prediction successful');
        
        const outputData = result.data as any[];
        send({ success: true, imageUrl: outputData[0]?.url || outputData[0]?.path });
        return res.end();
      } catch (e) { continue; }
    }
    throw new Error('All tokens failed');
  } catch (e: any) {
    send({ success: false, error: e.message });
    res.end();
  }
}
