import { Client } from '@gradio/client';

export interface HFSpaceConfig {
  spaceUrl: string;
  tokens: string;
  apiEndpoint?: string;
  injectNegativePrompt?: boolean;
  injectAnatomyGuard?: boolean;
}

export interface HFTestResult {
  success: boolean;
  message: string;
  spaceName?: string;
  spaceStage?: string;
  hardware?: string;
  activeTokenCount: number;
  activeTokenPreview?: string;
}

export interface GradioInputComponent {
  id: number;
  type: string;
  label: string;
  defaultValue: any;
}

export const DEFAULT_QWEN_SPACE_URL = 'https://huggingface.co/spaces/FelyaHuhing/qwen-image-21-uncensored';
export const DEFAULT_QWEN_SPACE_HOST = 'https://felyahuhing-qwen-image-21-uncensored.hf.space';

let currentTokenIndex = 0;
const exhaustedTokensMap = new Map<string, number>();

const isTokenExhausted = (token: string): boolean => {
  const ts = exhaustedTokensMap.get(token);
  if (!ts) return false;
  if (Date.now() - ts > 2 * 60 * 60 * 1000) {
    exhaustedTokensMap.delete(token);
    return false;
  }
  return true;
};

export const markTokenExhausted = (token: string) => {
  if (token) exhaustedTokensMap.set(token, Date.now());
};

export const parseHFTokens = (tokensInput?: string): string[] => {
  if (!tokensInput) return [];
  return tokensInput
    .split(/[\r\n,;\s]+/)
    .map(t => t.trim()
      .replace(/^(?:HF_TOKEN|TOKEN)\s*[:=]\s*/i, '')
      .replace(/^Bearer\s+/i, '')
      .replace(/^["']|["']$/g, '')
      .trim()
    )
    .filter(t => t.length > 0);
};

export const resetHFTokenRotation = () => {
  currentTokenIndex = 0;
  exhaustedTokensMap.clear();
};

export const toProxyUrl = (targetUrl: string): string => {
  if (!targetUrl) return '';
  if (targetUrl.startsWith('/') || targetUrl.startsWith('data:')) return targetUrl;
  return `/api/hf-proxy?url=${encodeURIComponent(targetUrl)}`;
};

export const proxyFetch = async (targetUrl: string, init?: RequestInit): Promise<Response> => {
  if (targetUrl.startsWith('data:')) {
    return await fetch(targetUrl, init);
  }
  const proxyUrl = toProxyUrl(targetUrl);
  try {
    const resp = await fetch(proxyUrl, init);
    const contentType = resp.headers.get('content-type') || '';
    if (resp.ok && contentType.includes('text/html') && !targetUrl.includes('.html') && !targetUrl.includes('huggingface.co/spaces')) {
      return await fetch(targetUrl, init);
    }
    if (resp.status === 404 || resp.status === 405 || resp.status === 502 || resp.status === 504) {
      return await fetch(targetUrl, init);
    }
    return resp;
  } catch (e) {
    return await fetch(targetUrl, init);
  }
};

export const normalizeHFSpaceUrl = async (rawUrl?: string): Promise<string> => {
  let url = (rawUrl || '').trim();
  if (!url || /^https?:\/?\/?$/i.test(url)) {
    return DEFAULT_QWEN_SPACE_HOST;
  }
  url = url.replace(/\/+$/, '');

  const match = url.match(/(?:https?:\/\/)?(?:www\.)?huggingface\.co\/spaces\/([^\/\s?#]+)\/([^\/\s?#]+)/i);
  if (match) {
    const owner = match[1];
    const repo = match[2];
    const cleanRepo = repo.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const cleanOwner = owner.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    return `https://${cleanOwner}-${cleanRepo}.hf.space`;
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }

  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch (e) {
    return DEFAULT_QWEN_SPACE_HOST;
  }
};

const getNextAvailableToken = (tokens: string[]): { token: string; index: number } | null => {
  if (!tokens || tokens.length === 0) return { token: '', index: 0 };

  for (let i = 0; i < tokens.length; i++) {
    const idx = (currentTokenIndex + i) % tokens.length;
    const tok = tokens[idx];
    if (!isTokenExhausted(tok)) {
      currentTokenIndex = idx;
      return { token: tok, index: idx };
    }
  }

  exhaustedTokensMap.clear();
  currentTokenIndex = 0;
  return { token: tokens[0], index: 0 };
};

const rotateToken = (tokens: string[], onStatus?: (status: string) => void): string | null => {
  if (!tokens || tokens.length <= 1) return null;
  const currentTok = tokens[currentTokenIndex];
  if (currentTok) markTokenExhausted(currentTok);
  const prevIdx = currentTokenIndex;

  currentTokenIndex = (currentTokenIndex + 1) % tokens.length;
  const nextTok = tokens[currentTokenIndex];
  const statusMsg = `Token #${prevIdx + 1} limit. Beralih ke Token #${currentTokenIndex + 1} (${tokens.length} token)...`;
  onStatus?.(statusMsg);
  return nextTok;
};

export const fetchUrlToDataUrl = async (url: string, token?: string): Promise<string> => {
  if (url.startsWith('data:')) return url;
  const targetUrl = url.replace(/^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?/i, '');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let resp = await proxyFetch(targetUrl, { headers });
  if (!resp.ok && targetUrl.includes('/file=')) {
    const altUrl = targetUrl.includes('/gradio_api/file=')
      ? targetUrl.replace('/gradio_api/file=', '/file=')
      : targetUrl.replace('/file=', '/gradio_api/file=');
    try {
      const altResp = await proxyFetch(altUrl, { headers });
      if (altResp.ok) resp = altResp;
    } catch {}
  }

  if (!resp.ok) {
    throw new Error(`Failed to fetch image from ${targetUrl}`);
  }
  const blob = await resp.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const uploadToGradio = async (spaceHost: string, dataUrl: string, token?: string): Promise<any> => {
  try {
    let effectiveDataUrl = dataUrl;
    if (dataUrl.startsWith('http://') || dataUrl.startsWith('https://')) {
      try {
        effectiveDataUrl = await fetchUrlToDataUrl(dataUrl, token);
      } catch {}
    }

    const parts = effectiveDataUrl.split(',');
    const mimeMatch = parts[0]?.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const binary = atob(parts[1] || '');
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
    const blob = new Blob([array], { type: mime });

    const formData = new FormData();
    formData.append('files', blob, 'input_image.png');

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const uploadEndpoints = [`${spaceHost}/gradio_api/upload`, `${spaceHost}/upload`];
    for (const ep of uploadEndpoints) {
      try {
        const resp = await proxyFetch(ep, { method: 'POST', headers, body: formData });
        if (resp.ok) {
          const text = await resp.text();
          if (text.startsWith('[')) {
            const data = JSON.parse(text);
            if (Array.isArray(data) && data.length > 0) {
              const item = data[0];
              const filePath = typeof item === 'string' ? item : (item?.path || item?.name || '');
              const fileUrl = typeof item === 'object' && item?.url ? item.url : `${spaceHost}/gradio_api/file=${filePath}`;
              return {
                path: filePath,
                url: fileUrl,
                orig_name: 'input_image.png',
                size: blob.size,
                mime_type: mime,
                meta: { _type: 'gradio.FileData' }
              };
            }
          }
        }
      } catch {}
    }

    return {
      path: null,
      url: effectiveDataUrl,
      orig_name: 'input_image.png',
      size: blob.size,
      mime_type: mime,
      meta: { _type: 'gradio.FileData' }
    };
  } catch (err) {
    return {
      path: null,
      url: dataUrl,
      orig_name: 'input_image.png',
      size: 0,
      mime_type: 'image/png',
      meta: { _type: 'gradio.FileData' }
    };
  }
};

const extractImageFromGradioOutput = async (data: any, spaceHost: string, token?: string): Promise<string> => {
  if (!data) throw new Error("Output dari HF Space kosong.");

  const findImage = (obj: any): string | null => {
    if (!obj) return null;
    if (typeof obj === 'string') {
      if (obj.startsWith('data:image/') || obj.startsWith('http://') || obj.startsWith('https://') || obj.startsWith('/file=') || obj.startsWith('/gradio_api/file=')) {
        return obj;
      }
    }
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = findImage(item);
        if (found) return found;
      }
    }
    if (typeof obj === 'object') {
      if (obj.url && typeof obj.url === 'string') return obj.url;
      if (obj.path && typeof obj.path === 'string') return `${spaceHost}/gradio_api/file=${obj.path}`;
      if (obj.image) return findImage(obj.image);
      for (const key of Object.keys(obj)) {
        const found = findImage(obj[key]);
        if (found) return found;
      }
    }
    return null;
  };

  let imgRef = findImage(data);
  if (!imgRef) {
    throw new Error("Gradio tidak mengembalikan gambar valid dalam outputnya: " + JSON.stringify(data).slice(0, 200));
  }

  imgRef = imgRef.replace(/^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?/i, spaceHost);
  if (imgRef.startsWith('/file=') || imgRef.startsWith('/gradio_api/file=')) {
    imgRef = `${spaceHost}${imgRef}`;
  }

  return await fetchUrlToDataUrl(imgRef, token);
};

const isQuotaOrLimitError = (err: any): boolean => {
  if (!err) return false;
  const msg = (err.message || err.raw || String(err)).toLowerCase();
  if (msg.includes('<!doctype') || msg.includes('<html') || msg.includes('bukan json')) return false;
  const status = err.status || err.statusCode;
  if (status === 429 || status === 402 || status === 401 || status === 403) return true;
  return msg.includes('quota') || msg.includes('exceeded') || msg.includes('rate limit') || msg.includes('exhausted') || msg.includes('429');
};

export const generateWithHuggingFaceSpace = async (
  inputImage: string | null,
  prompt: string,
  config: HFSpaceConfig,
  onStatusUpdate?: (status: string) => void
): Promise<{ imageUrl: string; usedIndex: number }> => {
  if (!inputImage) {
    throw new Error("Base image diperlukan untuk Hugging Face Space.");
  }

  const spaceHost = await normalizeHFSpaceUrl(config.spaceUrl);
  const tokens = parseHFTokens(config.tokens);
  const apiEndpoint = config.apiEndpoint || '/generate';

  const maxAttempts = Math.max(1, tokens.length);
  let attempts = 0;
  let lastError: any = null;

  while (attempts < maxAttempts) {
    attempts++;
    const tokenObj = getNextAvailableToken(tokens);
    const tokenToUse = tokenObj?.token || undefined;
    const currentIdx = tokenObj?.index || 0;

    try {
      onStatusUpdate?.(`Menghubungkan ke HF Space (Token #${currentIdx + 1})...`);
      const formattedImage = await uploadToGradio(spaceHost, inputImage, tokenToUse);

      onStatusUpdate?.("Mengirim tugas ke ZeroGPU...");
      const clientOptions: any = { timeout: 300000 };
      if (tokenToUse) clientOptions.hf_token = tokenToUse.trim();

      const host = spaceHost.replace('https://', '');
      const client = await Client.connect(host, { ...clientOptions, fetch: proxyFetch } as any);

      const response = await client.predict(apiEndpoint, {
        prompt: prompt,
        input_image: formattedImage,
        steps: 28,
        seed: 0,
        randomize_seed: true,
        lora_scale: 1.0,
      });

      const imageUrl = await extractImageFromGradioOutput(response.data, spaceHost, tokenToUse);
      return { imageUrl, usedIndex: currentIdx };

    } catch (err: any) {
      lastError = err;
      if (isQuotaOrLimitError(err) && tokenToUse) {
        markTokenExhausted(tokenToUse);
      }
      if (isQuotaOrLimitError(err) && tokens.length > 1 && attempts < maxAttempts) {
        rotateToken(tokens, onStatusUpdate);
        continue;
      } else {
        break;
      }
    }
  }

  throw new Error(lastError?.message || "Semua token Hugging Face gagal digunakan.");
};

export const testHuggingFaceSpace = async (rawUrl: string, tokensInput: string): Promise<HFTestResult> => {
  const tokens = parseHFTokens(tokensInput);
  try {
    const spaceHost = await normalizeHFSpaceUrl(rawUrl);
    const testToken = tokens[0] || undefined;
    const headers: Record<string, string> = {};
    if (testToken) headers['Authorization'] = `Bearer ${testToken}`;

    const resp = await proxyFetch(`${spaceHost}/config`, { headers });
    return {
      success: resp.ok,
      message: resp.ok ? `Terhubung ke Space! (${tokens.length} token)` : `Gagal terhubung (HTTP ${resp.status})`,
      activeTokenCount: tokens.length,
      activeTokenPreview: testToken ? `${testToken.slice(0, 6)}...${testToken.slice(-4)}` : 'Tanpa Token'
    };
  } catch (e: any) {
    return { success: false, message: e.message || 'Gagal koneksi', activeTokenCount: tokens.length };
  }
};
