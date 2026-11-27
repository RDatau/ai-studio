import { Client } from '@gradio/client';
import { fetchUrlToBlob } from './huggingFaceService';
import {
  DEFAULT_LTX_AUDIO_SETTINGS,
  LtxAudioSettingsState,
} from '../components/LtxAudioControls';

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
  audioSettings?: LtxAudioSettingsState;
  onStatusUpdate?: (status: string) => void;
}

export async function generateLtxVideoClientSide(params: LtxClientParams): Promise<{
  videoUrl: string;
  videoBlob?: Blob;
  downloadError?: string;
  usedIndex: number;
  usedToken?: string;
}> {
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
    audioSettings,
    onStatusUpdate
  } = params;

  const audio: LtxAudioSettingsState = audioSettings ?? DEFAULT_LTX_AUDIO_SETTINGS;

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
        audio_ref_enabled: Boolean(audio.audioRefEnabled),
        audio_ref_file: audio.audioRefEnabled && audio.audioRefFile ? audio.audioRefFile : null,
        audio_ref_guidance_scale: Number.isFinite(audio.audioRefGuidanceScale) ? audio.audioRefGuidanceScale : 3.0,
        audio_ref_stem_sep: Boolean(audio.audioRefStemSep),
        audio_ref_normalize: Boolean(audio.audioRefNormalize),
        sulphur_audio_strength: Number(audio.sulphurAudioStrength ?? 0.15),
        sulphur_v1_audio_strength: Number(audio.sulphurV1AudioStrength ?? 0.15),
        vbvr_audio_strength: Number(audio.vbvrAudioStrength ?? 0.5),
        dreamly_audio_strength: Number(audio.dreamlyAudioStrength ?? 0.6),
        synth_audio_strength: Number(audio.synthAudioStrength ?? 0.0),
        plora_audio_strength: Number(audio.ploraAudioStrength ?? 0.0),
        singularity_audio_strength: Number(audio.singularityAudioStrength ?? 0.3),
        omninft_audio_strength: Number(audio.omninftAudioStrength ?? 0.8),
        omninft_bf16_audio_strength: Number(audio.omninftBf16AudioStrength ?? 0.0),
        better_motion_audio_strength: Number(audio.betterMotionAudioStrength ?? 0.0),
        physics_v2_audio_strength: Number(audio.physicsV2AudioStrength ?? 0.0),
        hardcut_audio_strength: Number(audio.hardcutAudioStrength ?? 0.0),
        transition_audio_strength: Number(audio.transitionAudioStrength ?? 0.0),
      });

      const outputData = response.data as any[];
      if (!outputData || outputData.length === 0) {
        throw new Error("Space tidak mengembalikan data video.");
      }

      let videoUrl =
        outputData[0]?.url ||
        outputData[0]?.path ||
        outputData[0]?.video?.url ||
        outputData[0]?.video?.path;
      if (!videoUrl) {
        throw new Error("URL video tidak ditemukan dalam respons Space.");
      }

      const spaceHost = spaceUrl.includes('hf.space') ? spaceUrl.replace(/\/+$/, '') : 'https://rdata92-ltx-2-3-10eros.hf.space';
      if (videoUrl.startsWith('/file=') || videoUrl.startsWith('/gradio_api/file=')) {
        videoUrl = `${spaceHost}${videoUrl}`;
      } else if (!videoUrl.startsWith('http://') && !videoUrl.startsWith('https://') && !videoUrl.startsWith('data:')) {
        videoUrl = `${spaceHost}/gradio_api/file=${videoUrl}`;
      }

      onStatusUpdate?.("Mengunduh video MP4 ke penyimpanan biner permanen...");
      let videoBlob: Blob | undefined;
      let downloadError: string | undefined;

      for (let dlAttempt = 1; dlAttempt <= 3; dlAttempt++) {
        try {
          videoBlob = await fetchUrlToBlob(videoUrl, token);
          downloadError = undefined;
          break;
        } catch (convErr: any) {
          downloadError = convErr?.message || String(convErr);
          console.warn(`Percobaan unduh MP4 #${dlAttempt} gagal:`, downloadError);
          if (dlAttempt < 3) {
            onStatusUpdate?.(`Mengunduh ulang video MP4 (percobaan ${dlAttempt + 1}/3)...`);
            await new Promise(r => setTimeout(r, 1200));
          }
        }
      }

      onStatusUpdate?.(videoBlob ? "Video berhasil diunduh & siap disimpan permanen!" : "Video selesai dirender, tetapi gagal mengunduh salinan offline.");
      return { videoUrl, videoBlob, downloadError, usedIndex: i, usedToken: token };

    } catch (e: any) {
      console.warn(`Token #${i + 1} gagal:`, e.message || e);
      lastError = e;
      continue;
    }
  }

  throw new Error(lastError?.message || "Semua token Hugging Face gagal digunakan.");
}
