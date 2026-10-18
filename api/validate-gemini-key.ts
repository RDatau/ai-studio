import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateApiKey } from '../src/services/geminiClientService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  try {
    const { apiKey } = req.body;
    const result = await validateApiKey(apiKey);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ valid: false, message: err.message });
  }
}
