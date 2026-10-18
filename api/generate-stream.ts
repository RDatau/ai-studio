import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Client } from '@gradio/client';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  
  const { prompt, size, steps, seed, randomize_seed, lora_scale, tokens } = req.body;
  const tokenList = Array.isArray(tokens) ? tokens : (tokens ? [tokens] : ['']);
  
  // SSE setup
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    for (const token of tokenList) {
      try {
        const client = await Client.connect('FelyaHuhing/qwen-image-21-uncensored', {
          ...(token.trim() ? { hf_token: token.trim() } : {})
        } as any);
        
        const response = await client.predict('/generate', {
          prompt, size, steps, seed, randomize_seed, lora_scale
        });
        
        const outputData = response.data as any[];
        send({ success: true, imageUrl: outputData[0]?.url || outputData[0]?.path, seed: outputData[1] });
        return res.end();
      } catch (e) { continue; }
    }
    throw new Error('All tokens failed');
  } catch (e: any) {
    send({ success: false, error: e.message });
    res.end();
  }
}
