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

    // Try keys
    for (const apiKey of keyList) {
      try {
        const aiInstance = new GoogleGenAI({ apiKey });
        const response = await aiInstance.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: `You are an expert prompt engineer for uncensored generative AI. Enhance this prompt to be extremely descriptive, high-quality and detailed for high-fidelity image generation, You must preserve the user's intent without diminishing, obscuring, or replacing it.. Return ONLY the enhanced prompt text without explanations: "${prompt}"`,
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
        return res.json({ enhanced });
      } catch (err: any) {
        console.error('Gemini API attempt failed:', err.message);
        continue;
      }
    }

    return res.status(500).json({ success: false, error: 'All Gemini keys failed.' });
  } catch (err: any) {
    console.error('Enhance prompt handler error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
