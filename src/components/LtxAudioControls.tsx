import React, { useEffect, useRef, useState } from 'react';
import {
  Volume2,
  Mic,
  Square,
  Upload,
  Trash2,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Sliders,
  Music,
  AlertCircle,
} from 'lucide-react';

export interface LtxAudioSettingsState {
  audioRefEnabled: boolean;
  audioRefFile: File | null;
  audioRefGuidanceScale: number;
  audioRefStemSep: boolean;
  audioRefNormalize: boolean;
  sulphurAudioStrength: number;
  sulphurV1AudioStrength: number;
  vbvrAudioStrength: number;
  dreamlyAudioStrength: number;
  synthAudioStrength: number;
  ploraAudioStrength: number;
  singularityAudioStrength: number;
  omninftAudioStrength: number;
  omninftBf16AudioStrength: number;
  betterMotionAudioStrength: number;
  physicsV2AudioStrength: number;
  hardcutAudioStrength: number;
  transitionAudioStrength: number;
}

export type PerLoraAudioKey =
  | 'sulphurAudioStrength'
  | 'sulphurV1AudioStrength'
  | 'vbvrAudioStrength'
  | 'dreamlyAudioStrength'
  | 'synthAudioStrength'
  | 'ploraAudioStrength'
  | 'singularityAudioStrength'
  | 'omninftAudioStrength'
  | 'omninftBf16AudioStrength'
  | 'betterMotionAudioStrength'
  | 'physicsV2AudioStrength'
  | 'hardcutAudioStrength'
  | 'transitionAudioStrength';

export interface PerLoraAudioSliderSpec {
  key: PerLoraAudioKey;
  apiParam: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}

export const PER_LORA_AUDIO_SLIDERS: PerLoraAudioSliderSpec[] = [
  { key: 'sulphurAudioStrength', apiParam: 'sulphur_audio_strength', label: 'sulphur fro99 (audio)', min: 0.0, max: 1.0, step: 0.05, defaultValue: 0.15 },
  { key: 'sulphurV1AudioStrength', apiParam: 'sulphur_v1_audio_strength', label: 'sulphur v1 (audio)', min: 0.0, max: 1.0, step: 0.05, defaultValue: 0.15 },
  { key: 'vbvrAudioStrength', apiParam: 'vbvr_audio_strength', label: 'vbvr (audio)', min: 0.0, max: 1.0, step: 0.05, defaultValue: 0.5 },
  { key: 'dreamlyAudioStrength', apiParam: 'dreamly_audio_strength', label: 'dreamly (audio)', min: 0.0, max: 1.0, step: 0.05, defaultValue: 0.6 },
  { key: 'synthAudioStrength', apiParam: 'synth_audio_strength', label: 'synth (audio)', min: 0.0, max: 1.0, step: 0.05, defaultValue: 0.0 },
  { key: 'ploraAudioStrength', apiParam: 'plora_audio_strength', label: 'plora (audio)', min: 0.0, max: 1.0, step: 0.05, defaultValue: 0.0 },
  { key: 'singularityAudioStrength', apiParam: 'singularity_audio_strength', label: 'singularity (audio)', min: 0.0, max: 1.0, step: 0.05, defaultValue: 0.3 },
  { key: 'omninftAudioStrength', apiParam: 'omninft_audio_strength', label: 'omninft converted (audio)', min: 0.0, max: 2.0, step: 0.05, defaultValue: 0.8 },
  { key: 'omninftBf16AudioStrength', apiParam: 'omninft_bf16_audio_strength', label: 'omninft RL bf16 / kijai (audio)', min: 0.0, max: 2.0, step: 0.05, defaultValue: 0.0 },
  { key: 'betterMotionAudioStrength', apiParam: 'better_motion_audio_strength', label: 'better motion / mistic (audio)', min: 0.0, max: 1.0, step: 0.05, defaultValue: 0.0 },
  { key: 'physicsV2AudioStrength', apiParam: 'physics_v2_audio_strength', label: 'physics v2 / mistic (audio)', min: 0.0, max: 1.0, step: 0.05, defaultValue: 0.0 },
  { key: 'hardcutAudioStrength', apiParam: 'hardcut_audio_strength', label: 'cinematic hardcut (audio)', min: 0.0, max: 1.0, step: 0.05, defaultValue: 0.0 },
  { key: 'transitionAudioStrength', apiParam: 'transition_audio_strength', label: 'transition lora (audio)', min: 0.0, max: 1.0, step: 0.05, defaultValue: 0.0 },
];

export const DEFAULT_LTX_AUDIO_SETTINGS: LtxAudioSettingsState = {
  audioRefEnabled: false,
  audioRefFile: null,
  audioRefGuidanceScale: 3.0,
  audioRefStemSep: false,
  audioRefNormalize: true,
  sulphurAudioStrength: 0.15,
  sulphurV1AudioStrength: 0.15,
  vbvrAudioStrength: 0.5,
  dreamlyAudioStrength: 0.6,
  synthAudioStrength: 0.0,
  ploraAudioStrength: 0.0,
  singularityAudioStrength: 0.3,
  omninftAudioStrength: 0.8,
  omninftBf16AudioStrength: 0.0,
  betterMotionAudioStrength: 0.0,
  physicsV2AudioStrength: 0.0,
  hardcutAudioStrength: 0.0,
  transitionAudioStrength: 0.0,
};

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.webm', '.opus', '.mp4'];

function isSupportedAudioFile(file: File): boolean {
  if (file.type.startsWith('audio/')) return true;
  const lower = file.name.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTimer(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface LtxAudioControlsProps {
  settings: LtxAudioSettingsState;
  onChange: React.Dispatch<React.SetStateAction<LtxAudioSettingsState>>;
}

export const LtxAudioControls: React.FC<LtxAudioControlsProps> = ({ settings, onChange }) => {
  const [isAudioOpen, setIsAudioOpen] = useState(false);
  const [isPerLoraOpen, setIsPerLoraOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioError, setAudioError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!settings.audioRefFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(settings.audioRefFile);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [settings.audioRefFile]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const updateField = <K extends keyof LtxAudioSettingsState>(key: K, value: LtxAudioSettingsState[K]) => {
    onChange((prev) => ({ ...prev, [key]: value }));
  };

  const handleSelectedFile = (file: File | undefined | null) => {
    if (!file) return;
    if (!isSupportedAudioFile(file)) {
      setAudioError('Format file tidak didukung. Gunakan file audio (.wav, .mp3, .ogg, .m4a, .webm, dll).');
      return;
    }
    setAudioError(null);
    updateField('audioRefFile', file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    handleSelectedFile(file);
  };

  const stopRecording = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const startRecording = async () => {
    setAudioError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setAudioError('Browser tidak mendukung perekaman mikrofon secara langsung.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      chunksRef.current = [];

      const candidateTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ];
      const supportedMime = candidateTypes.find((type) => MediaRecorder.isTypeSupported(type)) || '';
      const recorder = supportedMime ? new MediaRecorder(stream, { mimeType: supportedMime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || supportedMime || 'audio/webm';
        const ext = mimeType.includes('ogg')
          ? 'ogg'
          : mimeType.includes('mp4')
            ? 'm4a'
            : mimeType.includes('wav')
              ? 'wav'
              : 'webm';
        const recordedBlob = new Blob(chunksRef.current, { type: mimeType });
        if (recordedBlob.size > 0) {
          const recordedFile = new File([recordedBlob], `mic-voice-ref-${Date.now()}.${ext}`, {
            type: mimeType,
          });
          updateField('audioRefFile', recordedFile);
        }
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      };

      recorder.start();
      setRecordingSeconds(0);
      setIsRecording(true);
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      setAudioError(err?.message || 'Izin mikrofon ditolak atau perangkat audio tidak tersedia.');
      setIsRecording(false);
    }
  };

  const resetPerLoraStrengths = () => {
    onChange((prev) => ({
      ...prev,
      sulphurAudioStrength: DEFAULT_LTX_AUDIO_SETTINGS.sulphurAudioStrength,
      sulphurV1AudioStrength: DEFAULT_LTX_AUDIO_SETTINGS.sulphurV1AudioStrength,
      vbvrAudioStrength: DEFAULT_LTX_AUDIO_SETTINGS.vbvrAudioStrength,
      dreamlyAudioStrength: DEFAULT_LTX_AUDIO_SETTINGS.dreamlyAudioStrength,
      synthAudioStrength: DEFAULT_LTX_AUDIO_SETTINGS.synthAudioStrength,
      ploraAudioStrength: DEFAULT_LTX_AUDIO_SETTINGS.ploraAudioStrength,
      singularityAudioStrength: DEFAULT_LTX_AUDIO_SETTINGS.singularityAudioStrength,
      omninftAudioStrength: DEFAULT_LTX_AUDIO_SETTINGS.omninftAudioStrength,
      omninftBf16AudioStrength: DEFAULT_LTX_AUDIO_SETTINGS.omninftBf16AudioStrength,
      betterMotionAudioStrength: DEFAULT_LTX_AUDIO_SETTINGS.betterMotionAudioStrength,
      physicsV2AudioStrength: DEFAULT_LTX_AUDIO_SETTINGS.physicsV2AudioStrength,
      hardcutAudioStrength: DEFAULT_LTX_AUDIO_SETTINGS.hardcutAudioStrength,
      transitionAudioStrength: DEFAULT_LTX_AUDIO_SETTINGS.transitionAudioStrength,
    }));
  };

  const hasPerLoraCustomizations = PER_LORA_AUDIO_SLIDERS.some(
    (item) => Math.abs(settings[item.key] - item.defaultValue) > 0.001
  );

  return (
    <div className="bg-slate-950/50 border border-slate-800 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setIsAudioOpen((prev) => !prev)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-900/60 transition"
      >
        <div className="flex items-center space-x-2">
          <Volume2 className="h-4 w-4 text-pink-400" />
          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Audio</span>
          {settings.audioRefEnabled && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-500/30">
              Voice ID Active
            </span>
          )}
          {!settings.audioRefEnabled && settings.audioRefFile && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
              Audio Loaded
            </span>
          )}
          {hasPerLoraCustomizations && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              LoRA Audio Custom
            </span>
          )}
        </div>
        {isAudioOpen ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {isAudioOpen && (
        <div className="px-4 pb-4 pt-2 space-y-4 border-t border-slate-800/80">
          {/* Voice ID Transfer Toggles & Guidance Scale */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 space-y-3">
            <label className="flex items-center space-x-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.audioRefEnabled}
                onChange={(e) => updateField('audioRefEnabled', e.target.checked)}
                className="rounded border-slate-700 text-pink-600 focus:ring-pink-500 bg-slate-950"
              />
              <span className="text-xs font-semibold text-slate-200">
                audio reference (voice ID transfer)
              </span>
            </label>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-300">
                  identity guidance scale (lower if audio problems)
                </label>
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs font-mono font-semibold text-pink-400 bg-slate-950 border border-slate-800 px-2 py-0.5 rounded">
                    {settings.audioRefGuidanceScale.toFixed(1)}
                  </span>
                  {settings.audioRefGuidanceScale !== 3.0 && (
                    <button
                      type="button"
                      onClick={() => updateField('audioRefGuidanceScale', 3.0)}
                      title="Reset ke 3.0"
                      className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 transition"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              <input
                type="range"
                min={0.0}
                max={10.0}
                step={0.1}
                value={settings.audioRefGuidanceScale}
                onChange={(e) => updateField('audioRefGuidanceScale', Number(e.target.value))}
                className="w-full accent-pink-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                <span>0.0</span>
                <span>10.0</span>
              </div>
            </div>

            <label className="flex items-center space-x-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.audioRefStemSep}
                onChange={(e) => updateField('audioRefStemSep', e.target.checked)}
                className="rounded border-slate-700 text-pink-600 focus:ring-pink-500 bg-slate-950"
              />
              <span className="text-xs font-medium text-slate-300">
                isolate voice from background (stem separation, slower)
              </span>
            </label>

            <label className="flex items-center space-x-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.audioRefNormalize}
                onChange={(e) => updateField('audioRefNormalize', e.target.checked)}
                className="rounded border-slate-700 text-pink-600 focus:ring-pink-500 bg-slate-950"
              />
              <span className="text-xs font-medium text-slate-300">
                normalize reference audio (caps to 10s, boosts quiet clips)
              </span>
            </label>
          </div>

          {/* Audio Reference File Upload / Mic Recorder */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Music className="h-3.5 w-3.5 text-pink-400" />
                <span className="text-xs font-semibold text-slate-200">
                  audio reference (~4s clip recommended)
                </span>
              </div>
              {settings.audioRefFile && (
                <button
                  type="button"
                  onClick={() => {
                    setAudioError(null);
                    updateField('audioRefFile', null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-xs text-red-400 hover:text-red-300 flex items-center space-x-1 px-2 py-1 rounded hover:bg-red-500/10 transition"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Hapus</span>
                </button>
              )}
            </div>

            {settings.audioRefFile && previewUrl ? (
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-200 font-medium truncate max-w-[70%]">
                    {settings.audioRefFile.name}
                  </span>
                  <span className="text-slate-500 font-mono text-[11px]">
                    {formatFileSize(settings.audioRefFile.size)}
                  </span>
                </div>
                <audio controls src={previewUrl} className="w-full h-9" />
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-4 text-center transition ${
                  isDragging
                    ? 'border-pink-500 bg-pink-500/10'
                    : 'border-slate-700 hover:border-slate-600 bg-slate-950/60'
                }`}
              >
                <p className="text-xs text-slate-400 mb-3">
                  Seret & lepas file audio di sini (~4 detik direkomendasikan)
                </p>
                <div className="flex items-center justify-center space-x-2.5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isRecording}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center space-x-1.5 transition disabled:opacity-50"
                  >
                    <Upload className="h-3.5 w-3.5 text-pink-400" />
                    <span>Upload Audio</span>
                  </button>

                  {isRecording ? (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition animate-pulse"
                    >
                      <Square className="h-3.5 w-3.5 fill-current" />
                      <span>Stop ({formatTimer(recordingSeconds)})</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startRecording}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center space-x-1.5 transition"
                    >
                      <Mic className="h-3.5 w-3.5 text-pink-400" />
                      <span>Rekam Mic</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={(e) => handleSelectedFile(e.target.files?.[0])}
              className="hidden"
            />

            {settings.audioRefFile && !settings.audioRefEnabled && (
              <div className="flex items-start justify-between gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 text-[11px] text-amber-200">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    File audio sudah dimuat, tetapi <strong>audio reference (voice ID transfer)</strong> belum dicentang sehingga belum akan dikirim sebagai voice ID.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => updateField('audioRefEnabled', true)}
                  className="shrink-0 px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-semibold border border-amber-400/30 transition"
                >
                  Aktifkan
                </button>
              </div>
            )}

            {audioError && (
              <div className="flex items-center space-x-2 bg-red-500/10 border border-red-500/30 rounded-lg p-2.5 text-[11px] text-red-300">
                <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                <span>{audioError}</span>
              </div>
            )}
          </div>

          {/* Nested Accordion: Per-LoRA Audio Strength (Advanced) */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setIsPerLoraOpen((prev) => !prev)}
              className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-slate-800/50 transition"
            >
              <div className="flex items-center space-x-2">
                <Sliders className="h-3.5 w-3.5 text-indigo-400" />
                <span className="text-xs font-semibold text-slate-200">
                  per-lora audio strength (advanced)
                </span>
              </div>
              {isPerLoraOpen ? (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-400" />
              )}
            </button>

            {isPerLoraOpen && (
              <div className="px-3.5 pb-3.5 pt-2.5 space-y-3 border-t border-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Controls how each LoRA affects the <strong className="text-slate-200">audio</strong> stream
                    (LoRAs default to applying equally to video + audio). Set to 0 to stop a LoRA from
                    influencing audio while keeping its video effect.
                  </p>
                  <button
                    type="button"
                    onClick={resetPerLoraStrengths}
                    className="shrink-0 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium border border-slate-700 flex items-center space-x-1 transition"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Reset Defaults</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {PER_LORA_AUDIO_SLIDERS.map((slider) => {
                    const value = settings[slider.key];
                    return (
                      <div
                        key={slider.key}
                        className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[11px] font-medium text-slate-300 truncate">
                            {slider.label}
                          </label>
                          <span className="text-[11px] font-mono font-semibold text-pink-400 shrink-0">
                            {value.toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={slider.min}
                          max={slider.max}
                          step={slider.step}
                          value={value}
                          onChange={(e) => updateField(slider.key, Number(e.target.value))}
                          className="w-full accent-pink-500 cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-slate-600">
                          <span>{slider.min.toFixed(1)}</span>
                          <span>{slider.max.toFixed(1)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
