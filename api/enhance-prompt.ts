import type { VercelRequest, VercelResponse } from '@vercel/node';
import { enhancePrompt } from '../src/services/geminiClientService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  try {
    console.log('Prompt enhancement request received. Body keys:', Object.keys(req.body));
    const { prompt, keys, image } = req.body;
    const result = await enhancePrompt(prompt, keys, image);
    return res.json(result);
  } catch (err: any) {
    console.error('Prompt enhancement error details:', err.message, err.stack);
    return res.status(500).json({ success: false, error: err.message || 'Prompt enhancement failed' });
  }
}
