import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { prompt, keys } = req.body;
    const keyList = Array.isArray(keys) ? keys : (typeof keys === 'string' ? keys.split('\n').map((k: string) => k.trim()).filter(Boolean) : []);

    if (keyList.length === 0) {
      return res.status(400).json({ success: false, error: 'No Gemini API keys provided.' });
    }

    // Try keys (simplified for Serverless: no stateful index)
    for (const apiKey of keyList) {
      try {
        const aiInstance = new GoogleGenAI({ apiKey });
        const response = await aiInstance.models.generateContent({
          model: 'gemini-2.0-flash', // Updated to a valid model
          contents: `You are an expert prompt engineer for Qwen-Image-2.1 uncensored generative AI. Enhance this prompt: "${prompt}"`,
        });
        const enhanced = response.text?.trim() || prompt;
        return res.json({ enhanced });
      } catch (err: any) {
        continue;
      }
    }

    return res.status(500).json({ success: false, error: 'All Gemini keys failed.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}
