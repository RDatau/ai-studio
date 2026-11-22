import { Client } from '@gradio/client';

export interface QwenClientParams {
  baseImage: string;
  inputImage2?: string | null;
  prompt: string;
  spaceUrl?: string;
  tokens: string[];
  steps?: number;
  seed?: number;
  randomize_seed?: boolean;
  lora_scale?: number;
  loraAdapter?: string;
  guidanceScale?: number;
  targetMegapixels?: number;
  extrasConditionOnly?: boolean;
  padToCanvas?: boolean;
  vaeTiling?: boolean;
  resolutionMultiple?: number;
  vaeRefMegapixels?: number;
  decoderVae?: string;
  keepDecoder2x?: boolean;
  highlightProtection?: boolean;
  highlightProtectionStrength?: number;
  lastWorkingIndex?: number;
  extraRefImage?: string | null;
  additionalImages?: string[];
  onStatusUpdate?: (status: string) => void;
}

export async function generateQwenImageClientSide(params: QwenClientParams): Promise<{ imageUrl: string; usedIndex: number; seed?: number }> {
  const {
    baseImage,
    inputImage2 = null,
    prompt,
    spaceUrl = 'https://huggingface.co/spaces/bennie2390/Qwen-Image-Edit-Rapid-AIO-Loras-Experimental',
    tokens = [''],
    steps = 28,
    seed = 0,
    randomize_seed = true,
    lora_scale = 1.0,
    loraAdapter = 'None',
    guidanceScale = 1.0,
    targetMegapixels = 1.0,
    extrasConditionOnly = true,
    padToCanvas = true,
    vaeTiling = false,
    resolutionMultiple = 32,
    vaeRefMegapixels = 0.0,
    decoderVae = 'qwen',
    keepDecoder2x = false,
    highlightProtection = true,
    highlightProtectionStrength = 0.35,
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

  let image2Blob: Blob | null = null;
  if (inputImage2) {
    image2Blob = await fetch(inputImage2).then(r => r.blob());
  } else if (extraRefImage) {
    image2Blob = await fetch(extraRefImage).then(r => r.blob());
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

      let endpoint = '/infer';
      let payload: any = {};

      if (spaceUrl.includes('bennie2390/Qwen-Image-Edit-Rapid-AIO-Loras-Experimental')) {
        endpoint = '/infer';
        payload = {
          input_image_1: baseBlob,
          input_image_2: image2Blob,
          input_images_extra: extraBlobs.map(b => ({ image: b })),
          prompt: prompt,
          lora_adapter: loraAdapter,
          seed: seed,
          randomize_seed: randomize_seed,
          guidance_scale: guidanceScale,
          steps: steps,
          target_megapixels: targetMegapixels,
          extras_condition_only: extrasConditionOnly,
          pad_to_canvas: padToCanvas,
          vae_tiling: vaeTiling,
          resolution_multiple: resolutionMultiple,
          vae_ref_megapixels: vaeRefMegapixels,
          decoder_vae: decoderVae,
          keep_decoder_2x: keepDecoder2x,
          highlight_protection: highlightProtection,
          highlight_protection_strength: highlightProtectionStrength,
        };
      } else {
        // Fallback/Default for rdata92/qwen-image-21-uncensored
        endpoint = '/edit';
        payload = {
          prompt: prompt,
          input_image: baseBlob,
          extra_images: extraBlobs.map(b => ({ image: b })),
          steps: steps,
          seed: seed,
          randomize_seed: randomize_seed,
          lora_scale: lora_scale,
        };
      }

      const response = await client.predict(endpoint, payload);

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

      const returnedSeed = typeof outputData[1] === 'number' ? outputData[1] : undefined;

      onStatusUpdate?.("Gambar berhasil dirender!");
      return { imageUrl, usedIndex: i, seed: returnedSeed };

    } catch (e: any) {
      console.warn(`Token Qwen #${i + 1} gagal:`, e.message || e);
      lastError = e;
      continue;
    }
  }

  throw new Error(lastError?.message || "Semua token Hugging Face gagal digunakan untuk Qwen Image Edit.");
}

export async function addDerivedConditioningClientSide(params: {
  baseImage: string;
  additionalImages: string[];
  derivedType: string;
  useGpu: boolean;
  tokens: string[];
}): Promise<{ derivedImageUrl: string }> {
  const { baseImage, additionalImages, derivedType, useGpu, tokens } = params;
  if (!baseImage) throw new Error('Please upload Image 1 first.');
  if (derivedType === 'None') throw new Error('Please select a Derived Type first.');

  const baseBlob = await fetch(baseImage).then(r => r.blob());
  const extraBlobs: Blob[] = [];
  for (const imgUrl of additionalImages) {
    if (imgUrl) extraBlobs.push(await fetch(imgUrl).then(r => r.blob()));
  }

  const tokenList = Array.isArray(tokens) && tokens.length > 0 ? tokens : [''];
  let lastError: any = null;

  for (const token of tokenList) {
    try {
      const clientOptions: any = { timeout: 180000 };
      if (token && token.trim()) clientOptions.hf_token = token.trim();

      const client = await Client.connect('bennie2390/Qwen-Image-Edit-Rapid-AIO-Loras-Experimental', clientOptions);
      const response = await client.predict('/add_derived_ref', {
        img1: baseBlob,
        existing_extra: extraBlobs.map(b => ({ image: b })),
        derived_type: derivedType,
        derived_use_gpu: useGpu,
      });

      const outputData = response.data as any[];
      const previewObj = outputData?.[1];
      let derivedUrl = previewObj?.url || previewObj?.path;
      if (!derivedUrl) {
        const galleryArr = outputData?.[0];
        if (Array.isArray(galleryArr) && galleryArr.length > 0) {
          const lastItem = galleryArr[galleryArr.length - 1];
          derivedUrl = lastItem?.image?.url || lastItem?.image?.path || lastItem?.url || lastItem?.path;
        }
      }
      if (!derivedUrl) throw new Error('Derived conditioning did not return an image.');

      if (derivedUrl.startsWith('/file=') || derivedUrl.startsWith('/gradio_api/file=')) {
        derivedUrl = `https://bennie2390-qwen-image-edit-rapid-aio-loras-experimental.hf.space${derivedUrl}`;
      }

      return { derivedImageUrl: derivedUrl };
    } catch (e: any) {
      lastError = e;
    }
  }

  throw new Error(lastError?.message || 'Failed to generate derived conditioning.');
}
