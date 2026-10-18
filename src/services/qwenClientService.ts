import { Client } from '@gradio/client';

export interface QwenClientParams {
  baseImage: string;
  prompt: string;
  spaceUrl?: string;
  tokens: string[];
  lastWorkingIndex?: number;
  extraRefImage?: string | null;
  additionalImages?: string[];
  onStatusUpdate?: (status: string) => void;
}

export async function generateQwenImageClientSide(params: QwenClientParams): Promise<{ imageUrl: string; usedIndex: number }> {
  const {
    baseImage,
    prompt,
    spaceUrl = 'https://huggingface.co/spaces/bennie2390/Qwen-Image-Edit-Rapid-AIO-Loras-Experimental',
    tokens = [''],
    lastWorkingIndex = 0,
    extraRefImage,
    additionalImages = [],
    onStatusUpdate
  } = params;

  if (!baseImage) {
    throw new Error("Base image diperlukan untuk Qwen Image Edit.");
  }

  const tokenList = Array.isArray(tokens) && tokens.length > 0 ? tokens : [''];
  const startIndex = (Number(lastWorkingIndex) || 0) % tokenList.length;

  onStatusUpdate?.("Mempersiapkan gambar dasar...");
  const baseBlob = await fetch(baseImage).then(r => r.blob());

  let extraBlob: Blob | null = null;
  if (extraRefImage) {
    extraBlob = await fetch(extraRefImage).then(r => r.blob());
  }

  const extraBlobs: Blob[] = [];
  if (Array.isArray(additionalImages)) {
    for (const imgUrl of additionalImages) {
      if (imgUrl) {
        const b = await fetch(imgUrl).then(r => r.blob());
        extraBlobs.push(b);
      }
    }
  }

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

      const host = spaceUrl.replace('https://huggingface.co/spaces/', '');
      const client = await Client.connect(host, clientOptions);
      onStatusUpdate?.("Terhubung! Mengirim tugas edit gambar ke ZeroGPU...");

      const response = await client.predict('/infer', {
        input_image_1: baseBlob,
        input_image_2: extraBlob,
        input_images_extra: extraBlobs,
        prompt: prompt,
        lora_adapter: "None",
        seed: 0,
        randomize_seed: true,
        guidance_scale: 1.0,
        steps: 28,
        target_megapixels: 1.0,
        extras_condition_only: true,
        pad_to_canvas: true,
        vae_tiling: false,
        resolution_multiple: 32,
        vae_ref_megapixels: 0.0,
        decoder_vae: "qwen",
        keep_decoder_2x: false,
        highlight_protection: true,
        highlight_protection_strength: 0.35,
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
        const spaceHost = spaceUrl.includes('hf.space') ? spaceUrl : 'https://bennie2390-qwen-image-edit-rapid-aio-loras-experimental.hf.space';
        imageUrl = `${spaceHost}${imageUrl}`;
      }

      onStatusUpdate?.("Gambar berhasil dirender!");
      return { imageUrl, usedIndex: i };

    } catch (e: any) {
      console.warn(`Token Qwen #${i + 1} gagal:`, e.message || e);
      lastError = e;
      continue;
    }
  }

  throw new Error(lastError?.message || "Semua token Hugging Face gagal digunakan untuk Qwen Image Edit.");
}
