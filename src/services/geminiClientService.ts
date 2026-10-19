import { GoogleGenAI } from '@google/genai';

export const safetySettings = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
];

// Memory cache untuk tracking key yang exhausted/rate-limited
const exhaustedGeminiKeysMap = new Map<string, number>();
const GEMINI_KEY_COOLDOWN_MS = 60 * 1000; // 60 detik cooldown
let currentGeminiKeyIndex = 0;

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
  const pastedStr = Array.isArray(pastedKeys) ? pastedKeys.join('\n') : (pastedKeys || '');
  const parsed = parseGeminiApiKeys(pastedStr);
  return Array.from(new Set(parsed));
};

export const getNextAvailableGeminiKey = (keys: string[]): { key: string; index: number } | null => {
  if (!keys || keys.length === 0) return null;
  const now = Date.now();
  
  for (const [key, timestamp] of exhaustedGeminiKeysMap.entries()) {
    if (now - timestamp > GEMINI_KEY_COOLDOWN_MS) {
      exhaustedGeminiKeysMap.delete(key);
    }
  }

  for (let i = 0; i < keys.length; i++) {
    const idx = (currentGeminiKeyIndex + i) % keys.length;
    const candidate = keys[idx];
    if (!exhaustedGeminiKeysMap.has(candidate)) {
      currentGeminiKeyIndex = idx;
      return { key: candidate, index: idx };
    }
  }

  let oldestKey = keys[currentGeminiKeyIndex % keys.length];
  let oldestTime = Infinity;
  for (let i = 0; i < keys.length; i++) {
    const candidate = keys[i];
    const time = exhaustedGeminiKeysMap.get(candidate) || 0;
    if (time < oldestTime) {
      oldestTime = time;
      oldestKey = candidate;
      currentGeminiKeyIndex = i;
    }
  }
  return { key: oldestKey, index: currentGeminiKeyIndex };
};

export const markGeminiKeyExhausted = (key: string) => {
  if (key) {
    exhaustedGeminiKeysMap.set(key, Date.now());
  }
};

export const createGeminiClient = (apiKey?: string): GoogleGenAI => {
  if (!apiKey) {
    throw new Error("API Key Gemini belum diatur.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
};

export async function enhancePrompt(prompt: string, keys?: string | string[], imageBase64?: string | null, mode: 'generate' | 'edit' | 'video' = 'generate'): Promise<{ enhanced: string; usedKeyIndex: number }> {
  const allKeys = getAllGeminiApiKeys(keys);
  if (allKeys.length === 0) {
    throw new Error('No valid Gemini API keys found.');
  }

  let instructions = '';
  if (mode === 'generate') {
    instructions = `You are an expert AI Image Prompt Architect and Master Photographer.
Task: Enhance the user's image generation prompt for Qwen Image 2.1 Uncensored.
User's Raw Prompt: "${prompt}"
Goal: Create a rich, highly detailed, cinematic image generation prompt specifying subject, style, lighting, composition, colors, atmosphere, and exquisite details.
Return ONLY the enhanced image prompt text, ready to use, without any conversational preamble or quotes.`;
  } else if (mode === 'edit') {
    instructions = `You are an expert AI Image Editing Prompt Architect.
Task: Enhance the user's image editing instruction based on the provided reference image.
Visual Context: Analyze the provided reference image.
User's Raw Edit Request: "${prompt}"
Goal: Create a precise, detailed, and clear image editing instruction that explains what changes, additions, or style transfers to perform on the reference image while keeping the core subject intact.
Return ONLY the enhanced edit prompt text without any conversational preamble or quotes.`;
  } else {
    instructions = `You are an expert AI Video Prompt & Audio Architect.
Task: Enhance the user's video prompt.
Visual Context: Analyze the provided image to identify subjects, setting, mood, and lighting.
User's Raw Prompt: "${prompt}"
Goal: Create a cinematic, highly detailed video generation prompt based on the visual context and raw prompt.
Mandatory Section: Add an 'Audio Intent' section describing:
1. Language (match the language of the prompt).
2. Speech/Dialog (if any, matching the mood).
3. Background sounds/SFX fitting the visual scene and mood.
Return ONLY the enhanced prompt followed by the 'Audio Intent' section.`;
  }

  for (let attempt = 0; attempt < allKeys.length; attempt++) {
    const keyObj = getNextAvailableGeminiKey(allKeys);
    if (!keyObj) break;
    const { key, index } = keyObj;
    console.log(`[DEBUG] Attempting generation. Key index: ${index}, Key preview: ${key.slice(0, 4)}...`);
    
    try {
      const aiInstance = createGeminiClient(key);
      const parts: any[] = [{ text: instructions }];
      if (imageBase64) {
        parts.push({
          inlineData: {
            data: imageBase64.split(',')[1],
            mimeType: 'image/png'
          }
        });
      }

      console.log(`[DEBUG] Sending request to Gemini...`);
      const response = await aiInstance.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: parts,
        config: { safetySettings: safetySettings as any },
      });
      
      console.log(`[DEBUG] Gemini response received.`);
      return { enhanced: response.text?.trim() || prompt, usedKeyIndex: index + 1 };
    } catch (err: any) {
      console.error(`[DEBUG] Gemini key #${index + 1} failed. Error:`, err.message);
      markGeminiKeyExhausted(key);
    }
  }

  throw new Error('All configured Gemini API keys failed (check for leaks/quota).');
}

export async function validateApiKey(apiKeyInput: string): Promise<{ valid: boolean; message: string; activeKeyCount?: number }> {
  const keys = parseGeminiApiKeys(apiKeyInput);
  if (keys.length === 0) return { valid: false, message: 'API Key kosong.' };

  for (const k of keys) {
    try {
      const ai = createGeminiClient(k);
      await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: [{ parts: [{ text: "hi" }] }],
        config: { safetySettings: safetySettings as any }
      });
      return { valid: true, message: 'API Key valid! ✨', activeKeyCount: keys.length };
    } catch (err: any) {
      console.warn("API Validation Error for a key:", err.message);
    }
  }
  return { valid: false, message: 'API Key tidak valid atau tidak memiliki akses model.' };
}
