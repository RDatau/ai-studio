import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Image as ImageIcon, Trash2, Sliders, Sparkles, RefreshCw } from 'lucide-react';

export const RAPID_AIO_SPACE_ID = 'bennie2390/Qwen-Image-Edit-Rapid-AIO-Loras-Experimental';

export interface RapidAioStyleSpec {
  id: string;
  requiresTwoImages?: boolean;
  image2Label?: string;
  presetPrompt?: string;
}

export const RAPID_AIO_STYLES: RapidAioStyleSpec[] = [
  { id: 'None' },
  { id: 'Consistance' },
  {
    id: 'Semirealistic-photo-detailer',
    presetPrompt: 'transform the image to semi-realistic image',
  },
  {
    id: 'AnyPose',
    requiresTwoImages: true,
    image2Label: 'Upload Pose Reference (Image 2)',
    presetPrompt:
      "Make the person in image 1 do the exact same pose of the person in image 2. Changing the style and background of the image of the person in image 1 is undesirable, so don't do it. The new pose should be pixel accurate to the pose we are trying to copy. The position of the arms and head and legs should be the same as the pose we are trying to copy. Change the field of view and angle to match exactly image 2. Head tilt and eye gaze pose should match the person in image 2.",
  },
  {
    id: 'Any2Real_2601',
    presetPrompt: 'change the picture 1 to realistic photograph',
  },
  {
    id: 'Hyperrealistic-Portrait',
    presetPrompt:
      'Transform the image into an ultra-realistic photorealistic portrait with strict identity preservation, facing straight to the camera. Enhance pore-level skin textures, realistic moisture effects, and natural wet hair clumping against the skin. Apply cool-toned soft-box lighting with subtle highlights and shadows, maintain realistic green-hazel eye catchlights without synthetic gloss, and preserve soft natural lip texture. Use shallow depth of field with a clean bokeh background, an 85mm macro photographic look, and raw photo grading without retouching to maintain realism and original details.',
  },
  {
    id: 'Ultrarealistic-Portrait',
    presetPrompt:
      'Transform the image into an ultra-realistic glamour portrait while strictly preserving the subject’s identity. Apply a close-up composition with a slight head tilt and a hand near the face, enhance cinematic directional lighting with dramatic fashion-style highlights, and refine makeup details including glowing skin, glossy lips, luminous highlighter, and defined eyes. Increase skin realism with detailed epidermal textures such as micropores, microhairs, subtle oil sheen, natural highlights, soft wrinkles, and subsurface scattering. Maintain a luxury fashion-magazine look in a 9:16 aspect ratio, preserving realism, facial structure, and original details without over-smoothing or retouching.',
  },
  {
    id: 'BFS-Best-FaceSwap',
    requiresTwoImages: true,
    image2Label: 'Upload Head/Face Donor (Image 2)',
    presetPrompt:
      'head_swap: start with Picture 1 as the base image, keeping its lighting, environment, and background. remove the head from Picture 1 completely and replace it with the head from Picture 2, strictly preserving the hair, eye color, and nose structure of Picture 2. copy the eye direction, head rotation, and micro-expressions from Picture 1. high quality, sharp details, 4k',
  },
  {
    id: 'BFS-Best-FaceSwap-merge',
    requiresTwoImages: true,
    image2Label: 'Upload Head/Face Donor (Image 2)',
    presetPrompt:
      'head_swap: start with Picture 1 as the base image, keeping its lighting, environment, and background. remove the head from Picture 1 completely and replace it with the head from Picture 2, strictly preserving the hair, eye color, and nose structure of Picture 2. copy the eye direction, head rotation, and micro-expressions from Picture 1. high quality, sharp details, 4k',
  },
  { id: 'F2P' },
  { id: 'Multiple-Angles' },
  { id: 'Light-Restoration' },
  { id: 'Relight' },
  { id: 'Multi-Angle-Lighting' },
  { id: 'Edit-Skin' },
  { id: 'Next-Scene' },
  { id: 'Flat-Log' },
  { id: 'Upscale-Image' },
  {
    id: 'Upscale2K',
    presetPrompt: 'Upscale this picture to 4K resolution.',
  },
];

export interface RapidAioSettingsState {
  loraAdapter: string;
  inputImage2: string | null;
  seed: number;
  randomizeSeed: boolean;
  guidanceScale: number;
  steps: number;
  targetMegapixels: number;
  resolutionMultiple: number;
  vaeRefMegapixels: number;
  decoderVae: 'qwen' | 'wan2x';
  keepDecoder2x: boolean;
  highlightProtection: boolean;
  highlightProtectionStrength: number;
  extrasConditionOnly: boolean;
  padToCanvas: boolean;
  vaeTiling: boolean;
  derivedType: string;
  derivedUseGpu: boolean;
  derivedPreview: string | null;
}

export const DEFAULT_RAPID_AIO_SETTINGS: RapidAioSettingsState = {
  loraAdapter: 'None',
  inputImage2: null,
  seed: 0,
  randomizeSeed: true,
  guidanceScale: 1.0,
  steps: 4,
  targetMegapixels: 1.0,
  resolutionMultiple: 32,
  vaeRefMegapixels: 0.0,
  decoderVae: 'qwen',
  keepDecoder2x: false,
  highlightProtection: true,
  highlightProtectionStrength: 0.35,
  extrasConditionOnly: true,
  padToCanvas: true,
  vaeTiling: false,
  derivedType: 'None',
  derivedUseGpu: false,
  derivedPreview: null,
};

interface RapidAioControlsProps {
  settings: RapidAioSettingsState;
  onChange: (updater: (prev: RapidAioSettingsState) => RapidAioSettingsState) => void;
  editPrompt: string;
  onPromptChange: (newPrompt: string) => void;
  onUploadImage2: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDropImage2: (e: React.DragEvent) => void;
  onAddDerivedRef: () => void;
  isAddingDerived: boolean;
}

const MAX_SEED = 2147483647;

export const RapidAioControls: React.FC<RapidAioControlsProps> = ({
  settings,
  onChange,
  editPrompt,
  onPromptChange,
  onUploadImage2,
  onDropImage2,
  onAddDerivedRef,
  isAddingDerived,
}) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [derivedOpen, setDerivedOpen] = useState(false);

  const selectedStyle = RAPID_AIO_STYLES.find((s) => s.id === settings.loraAdapter) || RAPID_AIO_STYLES[0];
  const requiresTwoImages = Boolean(selectedStyle.requiresTwoImages);

  const handleStyleChange = (nextStyleId: string) => {
    const spec = RAPID_AIO_STYLES.find((s) => s.id === nextStyleId);
    if (spec?.presetPrompt && !editPrompt.trim()) {
      onPromptChange(spec.presetPrompt);
    }

    onChange((prev) => ({
      ...prev,
      loraAdapter: nextStyleId,
      inputImage2: spec?.requiresTwoImages ? prev.inputImage2 : null,
      extrasConditionOnly:
        nextStyleId === 'BFS-Best-FaceSwap' ||
        nextStyleId === 'BFS-Best-FaceSwap-merge' ||
        nextStyleId === 'AnyPose'
          ? true
          : prev.extrasConditionOnly,
    }));
  };

  return (
    <div className="space-y-4">
      {/* Dynamic Image 2 slot (only shown for 2-image LoRAs like AnyPose & BFS FaceSwap) */}
      {requiresTwoImages && (
        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-purple-500/30 space-y-2">
          <label className="text-xs font-semibold text-purple-300 block">
            {selectedStyle.image2Label || 'Upload Reference (Image 2)'}
          </label>
          {settings.inputImage2 ? (
            <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-950 border border-slate-800">
              <img src={settings.inputImage2} alt="Reference Image 2" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => onChange((prev) => ({ ...prev, inputImage2: null }))}
                className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-lg opacity-85 hover:opacity-100 transition"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDropImage2}
              className="border-2 border-dashed border-slate-700 hover:border-purple-500 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer bg-slate-950/50 transition"
            >
              <ImageIcon className="h-6 w-6 text-purple-400 mb-1.5" />
              <span className="text-xs text-slate-300 font-medium">Upload or Drop Image 2</span>
              <input type="file" accept="image/*" onChange={onUploadImage2} className="hidden" />
            </label>
          )}
        </div>
      )}

      {/* Choose Editing Style */}
      <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
        <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
          <Sparkles className="h-3.5 w-3.5 text-purple-400" />
          <span>Choose Editing Style</span>
        </label>
        <select
          value={settings.loraAdapter}
          onChange={(e) => handleStyleChange(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
        >
          {RAPID_AIO_STYLES.map((style) => (
            <option key={style.id} value={style.id}>
              {style.id}
            </option>
          ))}
        </select>
      </div>

      {/* Advanced Settings Accordion */}
      <div className="rounded-xl bg-slate-950/70 border border-slate-800 overflow-hidden">
        <button
          type="button"
          onClick={() => setAdvancedOpen((prev) => !prev)}
          className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold text-slate-200 hover:bg-slate-900/70 transition"
        >
          <span className="flex items-center space-x-2">
            <Sliders className="h-3.5 w-3.5 text-purple-400" />
            <span>Advanced Settings</span>
          </span>
          {advancedOpen ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        </button>

        {advancedOpen && (
          <div className="p-4 pt-2 border-t border-slate-800/80 space-y-4">
            {/* Derived Conditioning (Pose / Depth) Nested Accordion */}
            <div className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden">
              <button
                type="button"
                onClick={() => setDerivedOpen((prev) => !prev)}
                className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-slate-300 hover:bg-slate-900 transition"
              >
                <span>Derived Conditioning (Pose / Depth)</span>
                {derivedOpen ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
              </button>

              {derivedOpen && (
                <div className="p-3.5 pt-2 border-t border-slate-800 space-y-3">
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1 block">
                      Derived Type (from Image 1)
                    </label>
                    <select
                      value={settings.derivedType}
                      onChange={(e) => onChange((prev) => ({ ...prev, derivedType: e.target.value }))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                    >
                      <option value="None">None</option>
                      <option value="Depth (Depth Anything V2 Small)">Depth (Depth Anything V2 Small)</option>
                    </select>
                  </div>

                  <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={settings.derivedUseGpu}
                      onChange={(e) => onChange((prev) => ({ ...prev, derivedUseGpu: e.target.checked }))}
                      className="rounded bg-slate-950 border-slate-700 text-purple-600 focus:ring-purple-500 h-4 w-4"
                    />
                    <span>Use GPU for derived model</span>
                  </label>

                  <button
                    type="button"
                    onClick={onAddDerivedRef}
                    disabled={isAddingDerived || settings.derivedType === 'None'}
                    className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-lg text-xs font-medium transition flex items-center justify-center space-x-1.5"
                  >
                    {isAddingDerived ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Generating Derived Ref...</span>
                      </>
                    ) : (
                      <span>➕ Add derived ref to Extras (conditioning-only recommended)</span>
                    )}
                  </button>

                  {settings.derivedPreview && (
                    <div className="space-y-1">
                      <span className="text-[11px] text-slate-400 block">Derived Conditioning Preview</span>
                      <img
                        src={settings.derivedPreview}
                        alt="Derived Conditioning Preview"
                        className="w-full max-h-40 object-contain rounded-lg border border-slate-800 bg-slate-950"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Seed & Randomize Seed */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300">Seed</label>
                <span className="text-[11px] font-mono text-slate-400">{settings.seed}</span>
              </div>
              <input
                type="range"
                min={0}
                max={MAX_SEED}
                step={1}
                disabled={settings.randomizeSeed}
                value={settings.seed}
                onChange={(e) => onChange((prev) => ({ ...prev, seed: Number(e.target.value) }))}
                className="w-full accent-purple-500 cursor-pointer disabled:opacity-40"
              />
              <input
                type="number"
                min={0}
                max={MAX_SEED}
                disabled={settings.randomizeSeed}
                value={settings.seed}
                onChange={(e) => onChange((prev) => ({ ...prev, seed: Number(e.target.value) }))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500 disabled:opacity-40"
              />
              <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={settings.randomizeSeed}
                  onChange={(e) => onChange((prev) => ({ ...prev, randomizeSeed: e.target.checked }))}
                  className="rounded bg-slate-950 border-slate-700 text-purple-600 focus:ring-purple-500 h-4 w-4"
                />
                <span>Randomize Seed</span>
              </label>
            </div>

            {/* Guidance Scale & Inference Steps */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">
                  Guidance Scale ({settings.guidanceScale.toFixed(1)})
                </label>
                <input
                  type="range"
                  min={1.0}
                  max={10.0}
                  step={0.1}
                  value={settings.guidanceScale}
                  onChange={(e) => onChange((prev) => ({ ...prev, guidanceScale: Number(e.target.value) }))}
                  className="w-full accent-purple-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">
                  Inference Steps ({settings.steps})
                </label>
                <input
                  type="range"
                  min={1}
                  max={50}
                  step={1}
                  value={settings.steps}
                  onChange={(e) => onChange((prev) => ({ ...prev, steps: Number(e.target.value) }))}
                  className="w-full accent-purple-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Target Megapixels & Resolution Lattice Multiple */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">
                  Target Megapixels ({settings.targetMegapixels.toFixed(1)} MP, 0 = match input)
                </label>
                <input
                  type="range"
                  min={0.0}
                  max={6.0}
                  step={0.1}
                  value={settings.targetMegapixels}
                  onChange={(e) => onChange((prev) => ({ ...prev, targetMegapixels: Number(e.target.value) }))}
                  className="w-full accent-purple-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">
                  Resolution lattice multiple (anti-drift)
                </label>
                <select
                  value={settings.resolutionMultiple}
                  onChange={(e) => onChange((prev) => ({ ...prev, resolutionMultiple: Number(e.target.value) }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                >
                  <option value={32}>32</option>
                  <option value={56}>56</option>
                  <option value={112}>112</option>
                </select>
              </div>
            </div>

            {/* Extra Refs VAE Megapixels & Decoder VAE */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">
                  Extra refs VAE MP override ({settings.vaeRefMegapixels.toFixed(1)}, 0 = canvas)
                </label>
                <input
                  type="range"
                  min={0.0}
                  max={6.0}
                  step={0.1}
                  value={settings.vaeRefMegapixels}
                  onChange={(e) => onChange((prev) => ({ ...prev, vaeRefMegapixels: Number(e.target.value) }))}
                  className="w-full accent-purple-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">
                  Decoder VAE
                </label>
                <select
                  value={settings.decoderVae}
                  onChange={(e) => onChange((prev) => ({ ...prev, decoderVae: e.target.value as 'qwen' | 'wan2x' }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                >
                  <option value="qwen">qwen</option>
                  <option value="wan2x">wan2x</option>
                </select>
              </div>
            </div>

            {/* Highlight Protection Strength */}
            <div>
              <label className="text-xs font-semibold text-slate-300 mb-1 block">
                Highlight protection strength ({settings.highlightProtectionStrength.toFixed(2)})
              </label>
              <input
                type="range"
                min={0.0}
                max={1.0}
                step={0.05}
                disabled={!settings.highlightProtection}
                value={settings.highlightProtectionStrength}
                onChange={(e) => onChange((prev) => ({ ...prev, highlightProtectionStrength: Number(e.target.value) }))}
                className="w-full accent-purple-500 cursor-pointer disabled:opacity-40"
              />
            </div>

            {/* Checkboxes */}
            <div className="space-y-2.5 pt-1 border-t border-slate-800/80">
              <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.keepDecoder2x}
                  onChange={(e) => onChange((prev) => ({ ...prev, keepDecoder2x: e.target.checked }))}
                  className="rounded bg-slate-950 border-slate-700 text-purple-600 focus:ring-purple-500 h-4 w-4"
                />
                <span>Keep 2× output (wan2x only)</span>
              </label>

              <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.highlightProtection}
                  onChange={(e) => onChange((prev) => ({ ...prev, highlightProtection: e.target.checked }))}
                  className="rounded bg-slate-950 border-slate-700 text-purple-600 focus:ring-purple-500 h-4 w-4"
                />
                <span>Highlight protection (reduce overexposure)</span>
              </label>

              <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.extrasConditionOnly}
                  onChange={(e) => onChange((prev) => ({ ...prev, extrasConditionOnly: e.target.checked }))}
                  className="rounded bg-slate-950 border-slate-700 text-purple-600 focus:ring-purple-500 h-4 w-4"
                />
                <span>Extra references are conditioning-only (exclude from VAE)</span>
              </label>

              <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.padToCanvas}
                  onChange={(e) => onChange((prev) => ({ ...prev, padToCanvas: e.target.checked }))}
                  className="rounded bg-slate-950 border-slate-700 text-purple-600 focus:ring-purple-500 h-4 w-4"
                />
                <span>Pad images to canvas aspect (avoid warping)</span>
              </label>

              <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.vaeTiling}
                  onChange={(e) => onChange((prev) => ({ ...prev, vaeTiling: e.target.checked }))}
                  className="rounded bg-slate-950 border-slate-700 text-purple-600 focus:ring-purple-500 h-4 w-4"
                />
                <span>VAE tiling (lower VRAM, slower)</span>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
