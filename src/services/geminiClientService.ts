import { GoogleGenAI } from '@google/genai';

export const safetySettings = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
];

// Memory cache untuk tracking key yang sudah terdeteksi leaked/banned
const bannedGeminiKeys = new Set<string>();

export const parseGeminiApiKeys = (input?: string): string[] => {
  if (!input) return [];
  return input
    .split(/[\r\n,;\s]+/)
    .map(k => k.trim()
      .replace(/^(?:GEMINI_API_KEY|API_KEY|KEY)\s*[:=]\s*/i, '')
      .replace(/^["']|["']$/g, '')
      .trim()
    )
    .filter(k => k.length > 10);
};

export const getAllGeminiApiKeys = (pastedKeys?: string | string[]): string[] => {
  const envKey = process.env.GEMINI_API_KEY || '';
  const pastedStr = Array.isArray(pastedKeys) ? pastedKeys.join('\n') : (pastedKeys || '');
  const combined = [pastedStr, envKey].join('\n');
  const parsed = parseGeminiApiKeys(combined);
  // Filter out banned keys
  return Array.from(new Set(parsed)).filter(k => !bannedGeminiKeys.has(k));
};

let lastWorkingGeminiKeyIndex = 0;

export async function enhancePrompt(prompt: string, keys?: string | string[], imageBase64?: string | null): Promise<{ enhanced: string; usedKeyIndex: number }> {
  const keyList = getAllGeminiApiKeys(keys);
  console.log(`[DEBUG] enhancePrompt: Found ${keyList.length} valid keys.`);
  if (keyList.length === 0) {
    throw new Error('No valid Gemini API keys found. If you recently saw a "leaked" error, generate a new API key in Google AI Studio.');
  }

  const instructions = `You are an expert AI Video Prompt & Audio Architect.
Task: Enhance the user's video prompt.
Visual Context: Analyze the provided image to identify subjects, setting, mood, and lighting.
User's Raw Prompt: "${prompt}"
Goal: Create a cinematic, highly detailed video generation prompt based on the visual context and raw prompt.
Mandatory Section: Add an 'Audio Intent' section describing:
1. Language (match the language of the prompt).
2. Speech/Dialog (if any, matching the mood).
3. Background sounds/SFX fitting the visual scene and mood.
Return ONLY the enhanced prompt followed by the 'Audio Intent' section.`;

  const startIdx = lastWorkingGeminiKeyIndex % keyList.length;

  for (let attempt = 0; attempt < keyList.length; attempt++) {
    const i = (startIdx + attempt) % keyList.length;
    const apiKey = keyList[i];
    
    try {
      const aiInstance = new GoogleGenAI({ 
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      const parts: any[] = [{ text: instructions }];
      if (imageBase64) {
        parts.push({
          inlineData: {
            data: imageBase64.split(',')[1],
            mimeType: 'image/png'
          }
        });
      }

      const response = await aiInstance.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: parts,
        config: {
          safetySettings: safetySettings as any,
        },
      });
      const enhanced = response.text?.trim() || prompt;
      lastWorkingGeminiKeyIndex = i;
      return { enhanced, usedKeyIndex: i + 1 };
    } catch (err: any) {
      const msg = (err?.message || "").toLowerCase();
      console.error(`Gemini key #${i + 1} (${apiKey.slice(0, 4)}...) failed:`, msg);
      
      if (msg.includes('leaked') || msg.includes('403') || msg.includes('401') || msg.includes('permission_denied')) {
        bannedGeminiKeys.add(apiKey);
        console.error(`Gemini key #${i + 1} is banned and has been blacklisted.`);
      }
    }
  }

  throw new Error('All configured Gemini API keys failed (check for leaks/quota).');
}

export async function validateApiKey(apiKey: string): Promise<{ valid: boolean; message: string; activeKeyCount?: number }> {
  if (!apiKey || !apiKey.trim()) {
    return { valid: false, message: 'API Key kosong.' };
  }
  const keys = parseGeminiApiKeys(apiKey);
  if (keys.length === 0) {
    return { valid: false, message: 'Format API Key tidak valid.' };
  }

  for (const k of keys) {
    if (bannedGeminiKeys.has(k)) continue;

    try {
      const ai = new GoogleGenAI({ 
        apiKey: k,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: [{ parts: [{ text: "hi" }] }],
        config: { safetySettings: safetySettings as any }
      });
      return { valid: true, message: 'API Key valid! ✨ Siap digunakan.', activeKeyCount: keys.length };
    } catch (err: any) {
      const msg = (err?.message || "").toLowerCase();
      if (msg.includes('leaked') || msg.includes('403') || msg.includes('401') || msg.includes('permission_denied')) {
        bannedGeminiKeys.add(k);
        return { valid: false, message: 'API Key ini telah dilaporkan bocor (leaked) oleh Google. Gunakan key baru.' };
      }
      if (msg.includes('429') || msg.includes('quota') || msg.includes('resource_exhausted')) {
        return { valid: false, message: 'API Key valid, tapi kuota limit (429).' };
      }
    }
  }

  return { valid: false, message: 'API Key tidak valid atau tidak memiliki akses model.' };
}
