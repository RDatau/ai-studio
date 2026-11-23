export interface GeminiModelOption {
  id: string;
  label: string;
  description: string;
}

export const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';

export const GEMINI_MODEL_OPTIONS: GeminiModelOption[] = [
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash-Lite (Default)',
    description: 'Cepat, ringan, dan hemat kuota untuk Prompt Enhance',
  },
  {
    id: 'gemini-3.1-flash-lite-preview',
    label: 'Gemini 3.1 Flash-Lite Preview',
    description: 'Alias publik Google AI Studio untuk Gemini 3.1 Flash-Lite',
  },
  {
    id: 'gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash-Lite',
    description: 'Flash-Lite generasi 3.5 yang responsif & efisien',
  },
  {
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash Preview',
    description: 'Gemini 3 Flash untuk detail prompt lebih kaya',
  },
  {
    id: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro Preview',
    description: 'Model Pro 3.1 dengan pemahaman konteks kompleks',
  },
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen (Flash)',
    description: 'Gemini 4 Flash serba cepat untuk teks & multimodal',
  },
  {
    id: 'gemini-4-argon',
    label: 'Gemini 4 Argon',
    description: 'Keseimbangan kecepatan & kualitas penalaran Gemini 4',
  },
  {
    id: 'gemini-4-neon',
    label: 'Gemini 4 Neon (Pro)',
    description: 'Gemini 4 Pro untuk instruksi prompt sangat kompleks',
  },
  {
    id: 'gemini-4-carbon',
    label: 'Gemini 4 Carbon',
    description: 'Deep reasoning Gemini 4 tingkat lanjut',
  },
  {
    id: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash-Lite',
    description: 'Model stabil 2.5 versi ringan',
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    description: 'Model stabil 2.5 cepat',
  },
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    description: 'Model stabil 2.5 kualitas tinggi',
  },
];
