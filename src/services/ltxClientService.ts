import { Client } from '@gradio/client';
import { fetchUrlToDataUrl } from './huggingFaceService';

export interface LtxClientParams {
  startImage: string;
  prompt: string;
  duration?: number;
  spaceUrl?: string;
  tokens: string[];
  lastWorkingIndex?: number;
  kfLastImage?: string | null;
  kfStrength?: number;
  kfMidEnabled?: boolean;
  kfMid1Image?: string | null;
  kfMid1Pos?: number;
  onStatusUpdate?: (status: string) => void;
}

export async function generateLtxVideoClientSide(params: LtxClientParams): Promise<{ videoUrl: string; usedIndex: number }> {
  const {
    startImage,
    prompt,
    duration = 4.0,
    spaceUrl = 'https://huggingface.co/spaces/rdata92/LTX-2.3-10Eros',
    tokens = [''],
    lastWorkingIndex = 0,
    kfLastImage,
    kfStrength = 0.82,
    kfMidEnabled = false,
    kfMid1Image,
    kfMid1Pos = 50,
    onStatusUpdate
  } = params;

  if (!startImage) {
    throw new Error("Start Frame diperlukan untuk LTX 2.3.");
  }

  const tokenList = Array.isArray(tokens) && tokens.length > 0 ? tokens : [''];
  const startIndex = (Number(lastWorkingIndex) || 0) % tokenList.length;

  onStatusUpdate?.("Mempersiapkan gambar awal (Start Frame)...");
  const imageBlob = await fetch(startImage).then(r => r.blob());

  let kfLastBlob: Blob | null = null;
  if (kfLastImage) {
    kfLastBlob = await fetch(kfLastImage).then(r => r.blob());
  }

  let kfMid1Blob: Blob | null = null;
  if (kfMidEnabled && kfMid1Image) {
    kfMid1Blob = await fetch(kfMid1Image).then(r => r.blob());
  }

  let lastError: any = null;

  for (let attempt = 0; attempt < tokenList.length; attempt++) {
    const i = (startIndex + attempt) % tokenList.length;
    const token = tokenList[i];
    
    try {
      onStatusUpdate?.(`Menghubungkan ke Hugging Face Space (Token #${i + 1})...`);
      
      const clientOptions: any = {
        timeout: 300000,
      };
      if (token && token.trim()) {
        clientOptions.hf_token = token.trim();
      }

      const client = await Client.connect(spaceUrl.replace('https://huggingface.co/spaces/', ''), clientOptions);
      onStatusUpdate?.("Terhubung ke Space! Mengirim parameter video & keyframes...");

      const enhancedPrompt = prompt.trim().toLowerCase().includes('audio intent')
        ? prompt
        : `${prompt} (Audio Intent: Suara latar yang natural dan dialog jelas yang menyatu dengan adegan sepanjang ${duration} detik)`;

      const response = await client.predict('/generate', {
        image_path: imageBlob,
        prompt: enhancedPrompt,
        negative_prompt: "captions, music, transition, VR, bad quality, subtitles, text, watermark, overlay effects, cartoon, childish, ugly, text, blur, logo, static, low quality, noise, mutant, horror, film grain",
        preset: "tuned",
        seconds: Number(duration) || 4.0,
        max_width: 1120,
        max_height: 1344,
        mode: "anchor only",
        face_bbox: "",
        likeness_strength: 0.9,
        likeness_anchor_strength: 0.15,
        latent_anchor_strength: 0.08,
        first_frame_strength: 0.82,
        seed: -1,
        randomize_seed: true,
        kf_last_image: kfLastBlob,
        kf_strength: Number(kfStrength) || 0.82,
        kf_mid_enabled: Boolean(kfMidEnabled),
        kf_mid_1_image: kfMid1Blob,
        kf_mid_1_pos: Number(kfMid1Pos) || 50,
        prompt_segments: "",
        scene_chain_prompt: "",
        scene_chain_enabled: false,
        profile_name: "",
        kv_enabled: false,
        kv_strength: 1.0,
        audio_ref_enabled: false,
      });

      const outputData = response.data as any[];
      if (!outputData || outputData.length === 0) {
        throw new Error("Space tidak mengembalikan data video.");
      }

      let videoUrl = outputData[0]?.url || outputData[0]?.path;
      if (!videoUrl) {
        throw new Error("URL video tidak ditemukan dalam respons Space.");
      }

      if (videoUrl.startsWith('/file=') || videoUrl.startsWith('/gradio_api/file=')) {
        const spaceHost = spaceUrl.includes('hf.space') ? spaceUrl : 'https://rdata92-ltx-2-3-10eros.hf.space';
        videoUrl = `${spaceHost}${videoUrl}`;
      }

      onStatusUpdate?.("Mengunduh & mengonversi video ke Base64 MP4 permanen...");
      try {
        const base64Video = await fetchUrlToDataUrl(videoUrl, token);
        if (base64Video && base64Video.startsWith('data:')) {
          videoUrl = base64Video;
        }
      } catch (convErr) {
        console.warn("Gagal mengonversi video ke Base64 MP4:", convErr);
      }

      onStatusUpdate?.("Video berhasil dirender!");
      return { videoUrl, usedIndex: i };

    } catch (e: any) {
      console.warn(`Token #${i + 1} gagal:`, e.message || e);
      lastError = e;
      continue;
    }
  }

  throw new Error(lastError?.message || "Semua token Hugging Face gagal digunakan.");
}
