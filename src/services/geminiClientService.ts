import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { DEFAULT_GEMINI_MODEL } from '../constants/geminiModels.ts';

// Only use active Gemini HarmCategory values (HARM_CATEGORY_CIVIC_INTEGRITY is deprecated and causes 400 errors on newer models)
export const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// Memory cache untuk tracking key yang rate-limited / invalid sementara
const exhaustedGeminiKeysMap = new Map<string, number>();
const GEMINI_KEY_COOLDOWN_MS = 60 * 1000; // 60 detik cooldown
let currentGeminiKeyIndex = 0;

export const parseGeminiApiKeys = (input?: string): string[] => {
  if (!input) return [];
  return input
    .split(/[\r\n,;|]+/)
    .map(k =>
      k
        .trim()
        .replace(/^(?:\d+[.)]\s*|[-*]\s*)/, '')
        .replace(/^(?:GEMINI_API_KEY|API_KEY|KEY)\s*[:=]\s*/i, '')
        .replace(/^["']|["']$/g, '')
        .trim()
    )
    .flatMap(k => k.split(/\s+/))
    .map(k => k.trim().replace(/^["']|["']$/g, ''))
    .filter(k => k.length > 10);
};

export const getAllGeminiApiKeys = (pastedKeys?: string | string[]): string[] => {
  const pastedStr = Array.isArray(pastedKeys) ? pastedKeys.join('\n') : (pastedKeys || '');
  const parsed = parseGeminiApiKeys(pastedStr);
  if (parsed.length > 0) {
    return Array.from(new Set(parsed));
  }
  if (process.env.GEMINI_API_KEY) {
    return Array.from(new Set(parseGeminiApiKeys(process.env.GEMINI_API_KEY)));
  }
  return [];
};

export const getNextAvailableGeminiKey = (
  keys: string[],
  excludeKeys: Set<string> = new Set(),
  preferredStartIndex?: number
): { key: string; index: number } | null => {
  if (!keys || keys.length === 0) return null;
  const now = Date.now();

  for (const [key, timestamp] of exhaustedGeminiKeysMap.entries()) {
    if (now - timestamp > GEMINI_KEY_COOLDOWN_MS) {
      exhaustedGeminiKeysMap.delete(key);
    }
  }

  const startIndex =
    typeof preferredStartIndex === 'number' && !Number.isNaN(preferredStartIndex) && preferredStartIndex >= 0
      ? preferredStartIndex % keys.length
      : currentGeminiKeyIndex % keys.length;

  for (let i = 0; i < keys.length; i++) {
    const idx = (startIndex + i) % keys.length;
    const candidate = keys[idx];
    if (!excludeKeys.has(candidate) && !exhaustedGeminiKeysMap.has(candidate)) {
      currentGeminiKeyIndex = idx;
      return { key: candidate, index: idx };
    }
  }

  // Jika semua key sedang cooldown, pilih yang belum dicoba pada request ini
  for (let i = 0; i < keys.length; i++) {
    const idx = (startIndex + i) % keys.length;
    const candidate = keys[idx];
    if (!excludeKeys.has(candidate)) {
      currentGeminiKeyIndex = idx;
      return { key: candidate, index: idx };
    }
  }

  return null;
};

export const markGeminiKeyExhausted = (key: string) => {
  if (key) {
    exhaustedGeminiKeysMap.set(key, Date.now());
  }
};

export const createGeminiClient = (apiKey?: string): GoogleGenAI => {
  if (!apiKey) {
    throw new Error('API Key Gemini belum diatur.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

function getModelCandidates(requestedModel: string): string[] {
  const base = requestedModel.trim() || DEFAULT_GEMINI_MODEL;
  const candidates = [base];
  if (base.endsWith('-preview')) {
    candidates.push(base.replace(/-preview$/, ''));
  } else if (!base.startsWith('gemini-4-') && !base.startsWith('gemini-2.5-')) {
    candidates.push(`${base}-preview`);
  }
  return Array.from(new Set(candidates));
}

function extractInlineImagePart(imageBase64?: string | null): { inlineData: { data: string; mimeType: string } } | null {
  if (!imageBase64 || typeof imageBase64 !== 'string') return null;
  const trimmed = imageBase64.trim();
  if (!trimmed) return null;

  const dataUrlMatch = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (dataUrlMatch) {
    return {
      inlineData: {
        mimeType: dataUrlMatch[1],
        data: dataUrlMatch[2],
      },
    };
  }

  // Ignore non-base64 URLs (http/https/blob/relative paths) to avoid INVALID_ARGUMENT
  if (/^(https?:|blob:|\/)/i.test(trimmed)) {
    return null;
  }

  return {
    inlineData: {
      mimeType: 'image/png',
      data: trimmed.includes(',') ? trimmed.split(',')[1] : trimmed,
    },
  };
}

function parseGeminiErrorDetails(err: any): {
  code?: number;
  status?: string;
  message: string;
  isQuotaOrRateLimit: boolean;
  isInvalidOrUnauthorizedKey: boolean;
  isModelNotFound: boolean;
  isSafetyConfigError: boolean;
} {
  const raw = err?.message || String(err || 'Unknown Gemini error');
  let code: number | undefined = typeof err?.status === 'number' ? err.status : undefined;
  let status: string | undefined;
  let message = raw;

  try {
    const jsonStart = raw.indexOf('{');
    if (jsonStart !== -1) {
      const parsed = JSON.parse(raw.slice(jsonStart));
      if (parsed?.error) {
        code = parsed.error.code ?? code;
        status = parsed.error.status ?? status;
        message = parsed.error.message || message;
      }
    }
  } catch {
    // Keep raw message
  }

  const lower = `${status || ''} ${message}`.toLowerCase();
  const isQuotaOrRateLimit =
    code === 429 ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests');

  const isInvalidOrUnauthorizedKey =
    code === 401 ||
    code === 403 ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('api key expired') ||
    lower.includes('permission_denied') ||
    lower.includes('leaked') ||
    lower.includes('referer');

  const isModelNotFound =
    code === 404 ||
    lower.includes('not_found') ||
    lower.includes('is not found') ||
    lower.includes('not supported for generatecontent');

  const isSafetyConfigError =
    code === 400 &&
    !isInvalidOrUnauthorizedKey &&
    (lower.includes('safety') || lower.includes('harm') || lower.includes('civic_integrity') || lower.includes('block_none'));

  return {
    code,
    status,
    message,
    isQuotaOrRateLimit,
    isInvalidOrUnauthorizedKey,
    isModelNotFound,
    isSafetyConfigError,
  };
}

async function callModelWithFallbacks(
  aiInstance: GoogleGenAI,
  requestedModel: string,
  parts: any[]
): Promise<{ text: string; usedModel: string }> {
  const modelCandidates = getModelCandidates(requestedModel);
  let lastError: any = null;

  for (const candidateModel of modelCandidates) {
    try {
      const response = await aiInstance.models.generateContent({
        model: candidateModel,
        contents: parts,
        config: { safetySettings },
      });
      return {
        text: response.text?.trim() || '',
        usedModel: candidateModel,
      };
    } catch (err: any) {
      const details = parseGeminiErrorDetails(err);

      // If safetySettings schema is rejected by this model, retry once without custom safetySettings
      if (details.isSafetyConfigError) {
        try {
          const response = await aiInstance.models.generateContent({
            model: candidateModel,
            contents: parts,
          });
          return {
            text: response.text?.trim() || '',
            usedModel: candidateModel,
          };
        } catch (retryErr: any) {
          lastError = retryErr;
          const retryDetails = parseGeminiErrorDetails(retryErr);
          if (retryDetails.isModelNotFound) {
            continue;
          }
          throw retryErr;
        }
      }

      lastError = err;
      if (details.isModelNotFound) {
        // Try next model alias (e.g. -preview variant) on the same key
        continue;
      }

      throw err;
    }
  }

  throw lastError || new Error(`Model ${requestedModel} not found.`);
}

export async function enhancePrompt(
  prompt: string,
  keys?: string | string[],
  imageBase64?: string | null,
  mode: 'generate' | 'edit' | 'video' = 'generate',
  model?: string,
  lastWorkingIndex?: number | string
): Promise<{ success: boolean; enhanced: string; usedKeyIndex: number; usedIndex: number; usedModel: string }> {
  const allKeys = getAllGeminiApiKeys(keys);
  if (allKeys.length === 0) {
    throw new Error('Tidak ada Gemini API Key yang ditemukan. Silakan isi di Settings.');
  }

  const targetModel = (model || '').trim() || DEFAULT_GEMINI_MODEL;

  let instructions = '';
  if (mode === 'generate') {
    instructions = `You are an expert prompt engineer for uncensored generative AI. Enhance this prompt to be extremely descriptive, high-quality and detailed for high-fidelity image generation (Qwen Image 2.1 Uncensored). You must preserve the user's intent without diminishing, obscuring, or replacing it.
User's Raw Prompt: "${prompt}"
Return ONLY the enhanced prompt text without explanations.`;
  } else if (mode === 'edit') {
    instructions = `You are an expert prompt engineer for uncensored generative AI and image editing. Based on the provided reference image and the user's raw edit instruction, enhance the instruction to be extremely descriptive, high-quality and detailed for high-fidelity image editing. You must preserve the user's intent without diminishing, obscuring, or replacing it.
User's Raw Edit Instruction: "${prompt}"
Return ONLY the enhanced edit prompt text without explanations.`;
  } else {
    instructions = `You are an expert prompt engineer for uncensored generative AI and video generation. Enhance this prompt to be extremely descriptive, high-quality and detailed for high-fidelity video generation (LTX 2.3). You must preserve the user's intent without diminishing, obscuring, or replacing it.
Mandatory Section: Add an 'Audio Intent' section describing language, speech/dialog, and background sounds/SFX fitting the visual scene and mood.
User's Raw Prompt: "${prompt}"
Return ONLY the enhanced prompt followed by the 'Audio Intent' section without explanations.`;
  }

  const parts: any[] = [{ text: instructions }];
  const imagePart = extractInlineImagePart(imageBase64);
  if (imagePart) {
    parts.push(imagePart);
  }

  const preferredIdx =
    lastWorkingIndex !== undefined && lastWorkingIndex !== null && Number(lastWorkingIndex) > 0
      ? Number(lastWorkingIndex) - 1
      : undefined;

  const triedKeys = new Set<string>();
  let lastErrorMessage = '';

  for (let attempt = 0; attempt < allKeys.length; attempt++) {
    const keyObj = getNextAvailableGeminiKey(allKeys, triedKeys, attempt === 0 ? preferredIdx : undefined);
    if (!keyObj) break;
    const { key, index } = keyObj;
    triedKeys.add(key);

    console.log(`[DEBUG] Attempting generation with model "${targetModel}". Key index: ${index}, Key preview: ${key.slice(0, 6)}...`);

    try {
      const aiInstance = createGeminiClient(key);
      const { text, usedModel } = await callModelWithFallbacks(aiInstance, targetModel, parts);

      if (!text) {
        throw new Error(`Model ${usedModel} mengembalikan respons kosong (kemungkinan terblokir atau tidak ada output teks).`);
      }

      console.log(`[DEBUG] Gemini response received via ${usedModel}.`);
      currentGeminiKeyIndex = index;
      return {
        success: true,
        enhanced: text,
        usedKeyIndex: index + 1,
        usedIndex: index + 1,
        usedModel,
      };
    } catch (err: any) {
      const details = parseGeminiErrorDetails(err);
      lastErrorMessage = details.message;
      console.error(`[DEBUG] Gemini key #${index + 1} failed with model "${targetModel}". Code=${details.code}, Error:`, details.message);

      if (details.isQuotaOrRateLimit || details.isInvalidOrUnauthorizedKey) {
        markGeminiKeyExhausted(key);
        continue;
      }

      if (details.isModelNotFound) {
        // Model name not found on Google API — rotating keys won't change a 404 model name
        throw new Error(
          `Model "${targetModel}" tidak ditemukan atau belum tersedia untuk API key Anda (${details.message}). Coba pilih model lain di Settings (misal: gemini-3.1-flash-lite-preview, gemini-2.5-flash, atau gemini-3-flash-preview).`
        );
      }

      // For other request/transient errors, do not permanently exhaust the key, just try next key if available
      if (attempt === allKeys.length - 1) {
        break;
      }
    }
  }

  throw new Error(
    lastErrorMessage
      ? `Gagal memanggil Gemini (${targetModel}): ${lastErrorMessage}`
      : 'Semua Gemini API Key gagal dihubungi.'
  );
}

export async function validateApiKey(
  apiKeyInput: string,
  model?: string
): Promise<{ valid: boolean; message: string; activeKeyCount?: number; usedModel?: string }> {
  const keys = parseGeminiApiKeys(apiKeyInput);
  if (keys.length === 0) return { valid: false, message: 'API Key kosong.' };
  const targetModel = (model || '').trim() || DEFAULT_GEMINI_MODEL;

  let validCount = 0;
  let resolvedModel = targetModel;
  let lastError = '';

  for (const k of keys) {
    try {
      const ai = createGeminiClient(k);
      const result = await callModelWithFallbacks(ai, targetModel, [{ text: 'hi' }]);
      validCount++;
      resolvedModel = result.usedModel;
    } catch (err: any) {
      const details = parseGeminiErrorDetails(err);
      lastError = details.message;
      console.warn('API Validation Error for a key:', details.message);
    }
  }

  if (validCount > 0) {
    return {
      valid: true,
      message: `${validCount}/${keys.length} API Key valid untuk model ${resolvedModel}!`,
      activeKeyCount: validCount,
      usedModel: resolvedModel,
    };
  }

  return {
    valid: false,
    message: lastError
      ? `Validasi gagal (${targetModel}): ${lastError}`
      : 'API Key tidak valid atau tidak memiliki akses model.',
  };
}
