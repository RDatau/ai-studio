import { Client } from '@gradio/client';

export interface QwenGenerateParams {
  prompt: string;
  size?: string;
  steps?: number;
  seed?: number;
  randomize_seed?: boolean;
  lora_scale?: number;
  tokens: string[];
  lastWorkingIndex?: number;
  onStatusUpdate?: (status: string) => void;
}

export async function generateQwenImageClientSide(params: QwenGenerateParams): Promise<{ imageUrl: string; usedIndex: number }> {
  const {
    prompt,
    size = "1024x1024 (1:1)",
    steps = 28,
    seed = 0,
    randomize_seed = true,
    lora_scale = 1.0,
    tokens = [''],
    lastWorkingIndex = 0,
    onStatusUpdate
  } = params;

  const tokenList = Array.isArray(tokens) && tokens.length > 0 ? tokens : [''];
  const startIndex = (Number(lastWorkingIndex) || 0) % tokenList.length;

  let width = 1024;
  let height = 1024;
  if (size.includes('1344x768')) { width = 1344; height = 768; }
  else if (size.includes('768x1344')) { width = 768; height = 1344; }
  else if (size.includes('1184x864')) { width = 1184; height = 864; }
  else if (size.includes('864x1184')) { width = 864; height = 1184; }

  let lastError: any = null;

  for (let attempt = 0; attempt < tokenList.length; attempt++) {
    const i = (startIndex + attempt) % tokenList.length;
    const token = tokenList[i];
    
    try {
      onStatusUpdate?.(`Menghubungkan ke Qwen Space (Token #${i + 1})...`);
      
      const clientOptions: any = {
        timeout: 300000,
      };
      if (token && token.trim()) {
        clientOptions.hf_token = token.trim();
      }

      const client = await Client.connect('FelyaHuhing/qwen-image-21-uncensored', clientOptions);
      onStatusUpdate?.("Terhubung! Mengirim tugas generate gambar...");

      const response = await client.predict('/generate', {
        prompt,
        width,
        height,
        num_inference_steps: steps,
        seed,
        randomize_seed,
        lora_scale
      });

      const outputData = response.data as any[];
      if (!outputData || outputData.length === 0) {
        throw new Error("Space tidak mengembalikan data gambar.");
      }

      let imageUrl = outputData[0]?.url || outputData[0]?.path;
      if (!imageUrl) {
        throw new Error("URL gambar tidak ditemukan dalam respons Space.");
      }

      if (imageUrl.startsWith('/file=') || imageUrl.startsWith('/gradio_api/file=')) {
        imageUrl = `https://felyahuhing-qwen-image-21-uncensored.hf.space${imageUrl}`;
      }

      onStatusUpdate?.("Gambar berhasil dirender!");
      return { imageUrl, usedIndex: i };

    } catch (e: any) {
      console.warn(`Token Qwen Generate #${i + 1} gagal:`, e.message || e);
      lastError = e;
      continue;
    }
  }

  throw new Error(lastError?.message || "Semua token Hugging Face gagal digunakan untuk Qwen Generate.");
}
