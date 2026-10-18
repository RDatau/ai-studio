import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Image as ImageIcon,
  Settings,
  History,
  Download,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Sliders,
  Layers,
  Copy,
  Check,
  ExternalLink,
  Maximize2,
  Key,
  HelpCircle,
  ChevronRight,
  Send,
  Plus,
  Play,
  Film,
  Video
} from 'lucide-react';
import { PWAInstallButton } from './components/PWAInstallButton';

interface GenerationHistoryItem {
  id: string;
  type: 'generate' | 'edit' | 'video';
  imageUrl?: string;
  videoUrl?: string;
  prompt: string;
  seed: number;
  steps?: number;
  loraScale?: number;
  size?: string;
  timestamp: string;
  usedTokenMasked: string;
}

interface TokenStatus {
  token: string;
  status: 'untested' | 'valid' | 'invalid';
  error?: string;
}

const SIZE_PRESETS = [
  "1024x1024 (1:1)",
  "1344x768 (16:9)",
  "768x1344 (9:16)",
  "1184x864 (4:3)",
  "864x1184 (3:4)"
];

const SAMPLE_PROMPTS = [
  "A neon shop sign that reads \"QWEN IMAGE 2.1\", rainy cyberpunk night, highly detailed",
  "Oil painting of a majestic red fox in a snowy pine forest, soft morning golden light",
  "Cinematic portrait of a futuristic cyberpunk warrior in neon lighting, 8k resolution",
  "A cozy futuristic loft apartment with large glass windows overlooking a lush alien jungle, sunset lighting"
];

const LTX_PRESETS = ["tuned", "original", "tuned #2", "experimental #1"];

const convertToPngBase64 = async (imageUrl: string): Promise<string> => {
  const response = await fetch(imageUrl);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx!.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
};

export default function App() {
  // Navigation & Modal state
  const [activeTab, setActiveTab] = useState<'generate' | 'edit' | 'video' | 'gallery'>('generate');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [fullScreenMedia, setFullScreenMedia] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  const [editSpace, setEditSpace] = useState('FelyaHuhing/qwen-image-21-uncensored');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [infoModal, setInfoModal] = useState<GenerationHistoryItem | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // ... (existing state)

  // Token state
  const [tokenInputText, setTokenInputText] = useState<string>('');
  const [tokenStatuses, setTokenStatuses] = useState<TokenStatus[]>([]);
  const [testingTokenIdx, setTestingTokenIdx] = useState<number | null>(null);
  const [testingAll, setTestingAll] = useState(false);

  // Gemini API Key state
  const [geminiKeyInputText, setGeminiKeyInputText] = useState<string>('');

  const handleGeminiKeyTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setGeminiKeyInputText(val);
    localStorage.setItem('qwen_gemini_keys', val);
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDrop = async (e: React.DragEvent, setter: (val: string) => void) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      const base64 = await convertToPngBase64(url);
      setter(base64);
      URL.revokeObjectURL(url);
    }
  };

  const handleExtraDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files) {
      for (const file of Array.from(files)) {
        if (file.type.startsWith('image/')) {
          const url = URL.createObjectURL(file);
          const base64 = await convertToPngBase64(url);
          setExtraImages(prev => [...prev, base64]);
          URL.revokeObjectURL(url);
        }
      }
    }
  };

  // Generator inputs
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('1024x1024 (1:1)');
  const [steps, setSteps] = useState(28);
  const [seed, setSeed] = useState(0);
  const [randomizeSeed, setRandomizeSeed] = useState(true);
  const [loraScale, setLoraScale] = useState(1.0);
  const [isEnhancing, setIsEnhancing] = useState(false);

  // Editor inputs
  const [editPrompt, setEditPrompt] = useState('');
  const [mainImage, setMainImage] = useState<string | null>(null);
  const [extraImages, setExtraImages] = useState<string[]>([]);
  const [editSteps, setEditSteps] = useState(28);
  const [editSeed, setEditSeed] = useState(0);
  const [editRandomizeSeed, setEditRandomizeSeed] = useState(true);
  const [editLoraScale, setEditLoraScale] = useState(1.0);

  // Video Generator Inputs (LTX 2.3)
  const [vidImage, setVidImage] = useState<string | null>(null);
  const [vidPrompt, setVidPrompt] = useState('');
  const [vidNegative, setVidNegative] = useState('captions, music, transition, VR, bad quality, subtitles, text, watermark, overlay effects, cartoon, childish, ugly, text, blur, logo, static, low quality, noise, mutant, horror, film grain');
  const [vidPreset, setVidPreset] = useState('tuned');
  const [vidSeconds, setVidSeconds] = useState(4.0);
  const [vidMaxWidth, setVidMaxWidth] = useState(1120);
  const [vidMaxHeight, setVidMaxHeight] = useState(1344);
  const [vidMode, setVidMode] = useState('anchor only');
  const [vidSeed, setVidSeed] = useState(-1);
  const [vidRandomize, setVidRandomize] = useState(true);
  const [currentVideoResult, setCurrentVideoResult] = useState<{ videoUrl: string; seed: number; usedTokenMasked: string } | null>(null);

  // Output & Loading state
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [currentResult, setCurrentResult] = useState<{ imageUrl: string; seed: number; usedTokenMasked: string } | null>(null);

  // History state
  const [history, setHistory] = useState<GenerationHistoryItem[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load tokens and history from IndexedDB on mount
  useEffect(() => {
    const savedTokens = localStorage.getItem('qwen_hf_tokens');
    if (savedTokens) {
      setTokenInputText(savedTokens);
      updateTokenStatuses(savedTokens);
    }

    const savedGeminiKeys = localStorage.getItem('qwen_gemini_keys');
    if (savedGeminiKeys) {
      setGeminiKeyInputText(savedGeminiKeys);
    }
    
    import('./utils/db').then(async ({ getHistory }) => {
      try {
        const savedHistory = await getHistory();
        if (savedHistory && savedHistory.length > 0) {
          setHistory(savedHistory.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
        }
      } catch (e) {
        console.error('Failed to load history from IndexedDB', e);
      }
    });
  }, []);


  // Remove the useEffect that saves history to localStorage

  // Update token statuses array when textarea changes
  const updateTokenStatuses = (text: string) => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    setTokenStatuses(prev => {
      return lines.map(line => {
        const existing = prev.find(p => p.token === line);
        return existing || { token: line, status: 'untested' };
      });
    });
  };

  const handleTokenTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setTokenInputText(val);
    localStorage.setItem('qwen_hf_tokens', val);
    updateTokenStatuses(val);
  };

  // Test individual token
  const testToken = async (index: number) => {
    const target = tokenStatuses[index];
    if (!target) return;
    setTestingTokenIdx(index);

    try {
      const res = await fetch('/api/test-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: target.token })
      });
      const data = await res.json();
      setTokenStatuses(prev => {
        const copy = [...prev];
        copy[index] = {
          ...copy[index],
          status: data.success ? 'valid' : 'invalid',
          error: data.error
        };
        return copy;
      });
    } catch (err: any) {
      setTokenStatuses(prev => {
        const copy = [...prev];
        copy[index] = { ...copy[index], status: 'invalid', error: err.message };
        return copy;
      });
    } finally {
      setTestingTokenIdx(null);
    }
  };

  // Test all tokens
  const testAllTokens = async () => {
    setTestingAll(true);
    for (let i = 0; i < tokenStatuses.length; i++) {
      await testToken(i);
    }
    setTestingAll(false);
  };

  const getTokensArray = () => {
    return tokenInputText.split('\n').map(l => l.trim()).filter(Boolean);
  };

  // Enhance prompt with Gemini using user keys with cycle rotation
  const handleEnhancePrompt = async (isEdit: boolean = false, isVideo: boolean = false) => {
    const targetPrompt = isVideo ? vidPrompt : (isEdit ? editPrompt : prompt);
    if (!targetPrompt.trim()) return;
    setIsEnhancing(true);
    try {
      const keys = geminiKeyInputText.split('\n').map(l => l.trim()).filter(Boolean);
      const res = await fetch('/api/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: targetPrompt, keys })
      });
      const data = await res.json();
      if (!data.success && data.error) {
        alert(data.error);
        return;
      }
      if (data.enhanced) {
        if (isVideo) setVidPrompt(data.enhanced);
        else if (isEdit) setEditPrompt(data.enhanced);
        else setPrompt(data.enhanced);
      }
    } catch (e: any) {
      alert(`Error enhancing prompt: ${e.message || 'Failed'}`);
    } finally {
      setIsEnhancing(false);
    }
  };

  // Generate Image with real-time stream status
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      alert('Please enter a prompt.');
      return;
    }
    setIsLoading(true);
    setLoadingMessage('Preparing data & initializing connection...');

    try {
      const tokens = getTokensArray();
      const res = await fetch('/api/generate-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          size,
          steps,
          seed,
          randomize_seed: randomizeSeed,
          lora_scale: loraScale,
          tokens
        })
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let finalData: any = null;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));
                if (data.status) {
                  setLoadingMessage(data.status);
                }
                if (data.success !== undefined) {
                  finalData = data;
                }
              } catch (e) {}
            }
          }
        }
      }

      if (!finalData || !finalData.success) {
        throw new Error(finalData?.error || 'Generation failed');
      }

      const pngBase64 = await convertToPngBase64(finalData.imageUrl);

      const resultObj = {
        imageUrl: pngBase64,
        seed: finalData.seed,
        usedTokenMasked: finalData.usedTokenMasked || 'Anonymous'
      };
      setCurrentResult(resultObj);

      const historyItem: GenerationHistoryItem = {
        id: Math.random().toString(36).substring(2, 9),
        type: 'generate',
        imageUrl: pngBase64,
        prompt,
        seed: finalData.seed,
        steps,
        loraScale,
        size,
        timestamp: new Date().toISOString(),
        usedTokenMasked: finalData.usedTokenMasked || 'Anonymous'
      };
      
      const { addHistoryItem } = await import('./utils/db');
      await addHistoryItem(historyItem);
      
      setHistory(prev => [historyItem, ...prev]);
    } catch (err: any) {
      alert(`Error: ${err.message || 'Failed to generate image'}`);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  // Edit Image with real-time stream status
  const handleEdit = async () => {
    if (!editPrompt.trim()) {
      alert('Please enter an edit instruction.');
      return;
    }
    if (!mainImage) {
      alert('Please upload a main reference image.');
      return;
    }

    setIsLoading(true);
    setLoadingMessage('Preparing reference image & pushing to Hugging Face...');

    try {
      const tokens = getTokensArray();
      const res = await fetch('/api/edit-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: editPrompt,
          image_data: mainImage,
          extra_images: extraImages,
          steps: editSteps,
          seed: editSeed,
          randomize_seed: editRandomizeSeed,
          lora_scale: editLoraScale,
          tokens,
          space: editSpace
        })
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let finalData: any = null;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));
                if (data.status) {
                  setLoadingMessage(data.status);
                }
                if (data.success !== undefined) {
                  finalData = data;
                }
              } catch (e) {}
            }
          }
        }
      }

      if (!finalData || !finalData.success) {
        throw new Error(finalData?.error || 'Image editing failed');
      }

      const pngBase64 = await convertToPngBase64(finalData.imageUrl);

      const resultObj = {
        imageUrl: pngBase64,
        seed: finalData.seed,
        usedTokenMasked: finalData.usedTokenMasked || 'Anonymous'
      };
      setCurrentResult(resultObj);

      const historyItem: GenerationHistoryItem = {
        id: Math.random().toString(36).substring(2, 9),
        type: 'edit',
        imageUrl: pngBase64,
        prompt: editPrompt,
        seed: finalData.seed,
        steps: editSteps,
        loraScale: editLoraScale,
        timestamp: new Date().toISOString(),
        usedTokenMasked: finalData.usedTokenMasked || 'Anonymous'
      };

      const { addHistoryItem } = await import('./utils/db');
      await addHistoryItem(historyItem);
      
      setHistory(prev => [historyItem, ...prev]);
    } catch (err: any) {
      alert(`Error: ${err.message || 'Failed to edit image'}`);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  // Generate Video (LTX 2.3) with real-time stream status
  const handleVideoGenerate = async () => {
    if (!vidPrompt.trim()) {
      alert('Please enter a prompt for video generation.');
      return;
    }
    if (!vidImage) {
      alert('Please upload a reference starting image for video generation.');
      return;
    }

    setIsLoading(true);
    setLoadingMessage('Preparing video reference data & pushing to Hugging Face...');

    try {
      const tokens = getTokensArray();
      const res = await fetch('/api/video-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_data: vidImage,
          prompt: vidPrompt,
          negative_prompt: vidNegative,
          preset: vidPreset,
          seconds: vidSeconds,
          max_width: vidMaxWidth,
          max_height: vidMaxHeight,
          mode: vidMode,
          seed: vidSeed,
          randomize_seed: vidRandomize,
          tokens
        })
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let finalData: any = null;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));
                if (data.status) {
                  setLoadingMessage(data.status);
                }
                if (data.success !== undefined) {
                  finalData = data;
                }
              } catch (e) {}
            }
          }
        }
      }

      if (!finalData || !finalData.success) {
        throw new Error(finalData?.error || 'Video generation failed');
      }

      const resultObj = {
        videoUrl: finalData.videoUrl,
        seed: finalData.seed,
        usedTokenMasked: finalData.usedTokenMasked || 'Anonymous'
      };
      setCurrentVideoResult(resultObj);

      const historyItem: GenerationHistoryItem = {
        id: Math.random().toString(36).substring(2, 9),
        type: 'video',
        videoUrl: finalData.videoUrl,
        prompt: vidPrompt,
        seed: finalData.seed,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        usedTokenMasked: finalData.usedTokenMasked || 'Anonymous'
      };
      setHistory(prev => [historyItem, ...prev]);
    } catch (err: any) {
      alert(`Error: ${err.message || 'Failed to generate video'}`);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  // Handle file uploads
  const handleMainImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      const base64 = await convertToPngBase64(url);
      setMainImage(base64);
      URL.revokeObjectURL(url);
    }
  };

  const handleVidImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      const base64 = await convertToPngBase64(url);
      setVidImage(base64);
      URL.revokeObjectURL(url);
    }
  };

  const handleExtraImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      for (const file of Array.from(files)) {
        const url = URL.createObjectURL(file);
        const base64 = await convertToPngBase64(url);
        setExtraImages(prev => [...prev, base64]);
        URL.revokeObjectURL(url);
      }
    }
  };

  const downloadMedia = (url: string, type: 'image' | 'video', index?: number) => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    const seqNum = String(index !== undefined ? index + 1 : Math.max(1, history.length)).padStart(3, '0');
    const ext = type === 'video' ? 'mp4' : 'png';
    const filename = `${type === 'video' ? 'video' : 'image'}-${day}-${month}-${year}_${hours}-${minutes}-${seconds}-${seqNum}.${ext}`;

    if (url.startsWith('data:')) {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    fetch(url)
      .then(res => res.blob())
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      })
      .catch(() => {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-purple-500 selection:text-white">
      {/* Info Modal */}
      {infoModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold mb-4">Creation Info</h3>
            <div className="space-y-3 text-sm text-slate-300">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <strong className="text-slate-400">Prompt:</strong>
                  <button 
                    onClick={async (e) => {
                      const btn = e.currentTarget;
                      const originalText = btn.innerHTML;
                      await navigator.clipboard.writeText(infoModal.prompt);
                      btn.innerHTML = '<span class="flex items-center space-x-1 text-emerald-400"><svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg><span>Tersalin!</span></span>';
                      setTimeout(() => { btn.innerHTML = originalText; }, 2000);
                    }}
                    className="text-xs bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded flex items-center space-x-1 transition-all"
                  >
                    <Copy className="h-3 w-3" />
                    <span>Copy</span>
                  </button>
                </div>
                <pre className="bg-slate-950 p-3 rounded-lg text-xs font-mono text-slate-400 whitespace-pre-wrap border border-slate-800">{infoModal.prompt}</pre>
              </div>
              <p><strong>Size:</strong> {infoModal.size || 'N/A'}</p>
              <p><strong>Steps:</strong> {infoModal.steps || 'N/A'}</p>
              <p><strong>LoRA Scale:</strong> {infoModal.loraScale || 'N/A'}</p>
              <p><strong>Seed:</strong> {infoModal.seed}</p>
              <p><strong>Timestamp:</strong> {infoModal.timestamp}</p>
            </div>
            <button onClick={() => setInfoModal(null)} className="mt-6 w-full py-2 bg-slate-800 hover:bg-slate-700 rounded-lg">Close</button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold mb-2 text-red-400">{confirmModal.title}</h3>
            <p className="text-sm text-slate-300 mb-6">{confirmModal.message}</p>
            <div className="flex space-x-3">
              <button onClick={() => setConfirmModal(prev => ({...prev, isOpen: false}))} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg">Cancel</button>
              <button onClick={() => { confirmModal.onConfirm(); setConfirmModal(prev => ({...prev, isOpen: false})); }} className="flex-1 py-2 bg-red-600 hover:bg-red-500 rounded-lg">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
            <Sparkles className="h-5 w-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="font-bold text-lg bg-gradient-to-r from-purple-400 via-pink-300 to-white bg-clip-text text-transparent">
                Qwen Image Studio Pro & Video
              </h1>
              <span className="px-2 py-0.5 text-xs font-semibold bg-purple-500/20 text-purple-300 rounded-full border border-purple-500/30">
                AI Studio
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Linked with <a href="https://huggingface.co/spaces/FelyaHuhing/qwen-image-21-uncensored" target="_blank" rel="noreferrer" className="text-purple-400 hover:underline">Qwen-Image-2.1</a> & <a href="https://huggingface.co/spaces/rdata92/LTX-2.3-10Eros" target="_blank" rel="noreferrer" className="text-pink-400 hover:underline">LTX-2.3 Video</a>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <PWAInstallButton />
          <button
            onClick={() => setActiveTab('generate')}
            className={`px-3.5 py-2 rounded-xl border flex items-center space-x-2 text-sm font-medium transition ${
              activeTab === 'generate'
                ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-600/30'
                : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            <span>Generate (T2I)</span>
          </button>

          <button
            onClick={() => setActiveTab('edit')}
            className={`px-3.5 py-2 rounded-xl border flex items-center space-x-2 text-sm font-medium transition ${
              activeTab === 'edit'
                ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-600/30'
                : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Edit (I2I)</span>
          </button>

          <button
            onClick={() => setActiveTab('video')}
            className={`px-3.5 py-2 rounded-xl border flex items-center space-x-2 text-sm font-medium transition ${
              activeTab === 'video'
                ? 'bg-pink-600 border-pink-500 text-white shadow-lg shadow-pink-600/30'
                : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <Film className="h-4 w-4 text-pink-300" />
            <span>Video (I2V)</span>
          </button>

          <button
            onClick={() => setActiveTab('gallery')}
            className={`px-3.5 py-2 rounded-xl border flex items-center space-x-2 text-sm font-medium transition ${
              activeTab === 'gallery'
                ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-600/30'
                : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <History className="h-4 w-4" />
            <span>Gallery ({history.length})</span>
          </button>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center space-x-2 text-sm font-medium transition shadow-sm hover:border-purple-500/50"
          >
            <Key className="h-4 w-4 text-purple-400" />
            <span>Tokens ({tokenStatuses.length})</span>
            {tokenStatuses.some(t => t.status === 'valid') && (
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
            )}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {activeTab === 'gallery' ? (
          <div className="lg:col-span-12 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-2xl font-bold">Creation Gallery</h2>
                <p className="text-sm text-slate-400">View, download, or reuse past images and videos.</p>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setActiveTab('generate')}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-medium transition"
                >
                  Create New
                </button>
                {history.length > 0 && !isSelectMode && (
                  <>
                    <button
                      onClick={() => setIsSelectMode(true)}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-sm font-medium transition"
                    >
                      Select
                    </button>
                    <button
                      onClick={() => {
                        setConfirmModal({
                          isOpen: true,
                          title: 'Clear All History',
                          message: 'Are you sure you want to clear all history? This action cannot be undone.',
                          onConfirm: async () => {
                            const { clearHistory } = await import('./utils/db');
                            await clearHistory();
                            setHistory([]);
                            setSelectedIds([]);
                          }
                        });
                      }}
                      className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-sm font-medium transition"
                    >
                      Clear History
                    </button>
                  </>
                )}
                {history.length > 0 && isSelectMode && (
                  <>
                    <button
                      onClick={() => {
                        if (selectedIds.length === history.length) {
                          setSelectedIds([]);
                        } else {
                          setSelectedIds(history.map(item => item.id));
                        }
                      }}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-sm font-medium transition"
                    >
                      {selectedIds.length === history.length ? 'Deselect All' : 'Select All'}
                    </button>
                    {selectedIds.length > 0 && (
                      <button
                        onClick={() => {
                          setConfirmModal({
                            isOpen: true,
                            title: `Delete Selected (${selectedIds.length})`,
                            message: `Are you sure you want to delete ${selectedIds.length} selected item(s)? This action cannot be undone.`,
                            onConfirm: async () => {
                              const { deleteHistoryItem } = await import('./utils/db');
                              for (const id of selectedIds) {
                                await deleteHistoryItem(id);
                              }
                              setHistory(prev => prev.filter(h => !selectedIds.includes(h.id)));
                              setSelectedIds([]);
                              setIsSelectMode(false);
                            }
                          });
                        }}
                        className="px-3.5 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30 rounded-xl text-sm font-medium transition flex items-center space-x-1.5"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span>Delete ({selectedIds.length})</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setIsSelectMode(false);
                        setSelectedIds([]);
                      }}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-medium transition"
                    >
                      Done
                    </button>
                  </>
                )}
              </div>
            </div>

            {history.length === 0 ? (
              <div className="text-center py-20 bg-slate-900/40 border border-slate-800 rounded-2xl">
                <ImageIcon className="h-12 w-12 text-slate-600 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-slate-300">No creations saved yet</h3>
                <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">Start generating images or videos in the studio to see them saved here.</p>
                <button
                  onClick={() => setActiveTab('generate')}
                  className="mt-6 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-medium transition inline-flex items-center space-x-2"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Start Generating</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                {history.map((item, index) => (
                  <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden group hover:border-purple-500/50 transition shadow-xl flex flex-col">
                    <div className="relative aspect-square overflow-hidden bg-slate-950">
                      {item.type === 'video' ? (
                        <video src={item.videoUrl} className="w-full h-full object-cover" muted loop autoPlay playsInline />
                      ) : (
                        <img src={item.imageUrl} alt={item.prompt} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                      )}
                      {isSelectMode && (
                        <div className="absolute top-2 left-2 z-50">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(item.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedIds(prev => [...prev, item.id]);
                              } else {
                                setSelectedIds(prev => prev.filter(id => id !== item.id));
                              }
                            }}
                            className="h-4 w-4 rounded bg-slate-950 border-slate-700 text-purple-600 focus:ring-purple-500 cursor-pointer shadow"
                          />
                        </div>
                      )}
                      <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition z-50">
                        <button
                          onClick={() => setInfoModal(item)}
                          className="p-2 bg-slate-950/80 hover:bg-slate-950 text-blue-400 rounded-lg backdrop-blur shadow"
                          title="Info"
                        >
                          <AlertCircle className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setConfirmModal({
                              isOpen: true,
                              title: 'Delete Item',
                              message: 'Are you sure you want to delete this item? This action cannot be undone.',
                              onConfirm: async () => {
                                const { deleteHistoryItem } = await import('./utils/db');
                                await deleteHistoryItem(item.id);
                                setHistory(prev => prev.filter(h => h.id !== item.id));
                              }
                            });
                          }}
                          className="p-2 bg-slate-950/80 hover:bg-red-950 text-red-400 rounded-lg backdrop-blur shadow"
                          title="Hapus"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent opacity-0 group-hover:opacity-100 transition flex items-end p-4 z-40">
                        <div className="flex space-x-2 w-full">
                          <button
                            onClick={() => downloadMedia(item.type === 'video' ? item.videoUrl! : item.imageUrl!, item.type === 'video' ? 'video' : 'image', index)}
                            className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center space-x-1 transition shadow"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>Download</span>
                          </button>
                          <button
                            onClick={() => {
                              if (item.imageUrl) {
                                setMainImage(item.imageUrl);
                                setActiveTab('edit');
                              }
                            }}
                            className="p-2 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 rounded-lg transition"
                            title="Edit"
                          >
                            <Layers className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (item.imageUrl) {
                                setVidImage(item.imageUrl);
                                setActiveTab('video');
                              }
                            }}
                            className="p-2 bg-pink-600/20 hover:bg-pink-600/40 text-pink-400 rounded-lg transition"
                            title="Generate Video"
                          >
                            <Film className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setFullScreenMedia({ url: item.type === 'video' ? item.videoUrl! : item.imageUrl!, type: item.type === 'video' ? 'video' : 'image' })}
                            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
                          >
                            <Maximize2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <span className="absolute top-3 left-3 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-slate-950/70 backdrop-blur text-purple-300 rounded border border-purple-500/30">
                        {item.type}
                      </span>
                    </div>
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <p className="text-sm text-slate-300 line-clamp-2" title={item.prompt}>
                        {item.prompt}
                      </p>
                      <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-800/80">
                        <span>Seed: {item.seed}</span>
                        <span>{item.timestamp}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Left Controls Column */}
            <div className="lg:col-span-5 space-y-6">
              {activeTab === 'generate' && (
                /* Generate Form */
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-xl">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-slate-200">Prompt Description</label>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleEnhancePrompt(false, false)}
                        disabled={isEnhancing || !prompt.trim()}
                        className="text-xs text-purple-400 hover:text-purple-300 flex items-center space-x-1 disabled:opacity-50"
                      >
                        <Sparkles className="h-3 w-3" />
                        <span>{isEnhancing ? 'Enhancing...' : 'AI Enhance Prompt'}</span>
                      </button>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(prompt);
                        }}
                        className="text-xs text-slate-400 hover:text-white flex items-center space-x-1"
                      >
                        <Copy className="h-3 w-3" />
                        <span>Copy</span>
                      </button>
                    </div>
                  </div>
                  <textarea
                    rows={4}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe the image you want to generate in detail..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition resize-none"
                  />

                  <div className="space-y-2">
                    <span className="text-xs font-medium text-slate-400">Quick Inspirations:</span>
                    <div className="flex flex-wrap gap-2">
                      {SAMPLE_PROMPTS.map((sp, idx) => (
                        <button
                          key={idx}
                          onClick={() => setPrompt(sp)}
                          className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700 transition truncate max-w-full text-left"
                        >
                          {sp}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Image Size / Ratio</label>
                      <select
                        value={size}
                        onChange={(e) => setSize(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                      >
                        {SIZE_PRESETS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Inference Steps ({steps})</label>
                      <input
                        type="range"
                        min={8}
                        max={50}
                        value={steps}
                        onChange={(e) => setSteps(Number(e.target.value))}
                        className="w-full accent-purple-500 cursor-pointer mt-2"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Seed</label>
                      <input
                        type="number"
                        disabled={randomizeSeed}
                        value={seed}
                        onChange={(e) => setSeed(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-purple-500 disabled:opacity-50"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1.5 block">LoRA Scale ({loraScale})</label>
                      <input
                        type="range"
                        min={0.0}
                        max={1.5}
                        step={0.05}
                        value={loraScale}
                        onChange={(e) => setLoraScale(Number(e.target.value))}
                        className="w-full accent-purple-500 cursor-pointer mt-2"
                      />
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 pt-1">
                    <input
                      type="checkbox"
                      id="randSeed"
                      checked={randomizeSeed}
                      onChange={(e) => setRandomizeSeed(e.target.checked)}
                      className="rounded bg-slate-950 border-slate-700 text-purple-600 focus:ring-purple-500 h-4 w-4"
                    />
                    <label htmlFor="randSeed" className="text-xs text-slate-300 cursor-pointer select-none">
                      Randomize seed on each generation
                    </label>
                  </div>

                  <button
                    onClick={handleGenerate}
                    disabled={isLoading}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:opacity-90 text-white font-bold text-base shadow-xl shadow-purple-600/30 transition flex items-center justify-center space-x-2 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="h-5 w-5 animate-spin" />
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-5 w-5" />
                        <span>Generate Image</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {activeTab === 'edit' && (
                /* Edit Form */
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-xl">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Select Edit Space</label>
                    <select
                      value={editSpace}
                      onChange={(e) => setEditSpace(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                    >
                      <option value="FelyaHuhing/qwen-image-21-uncensored">Qwen-Image-2.1 Uncensored (Standard)</option>
                      <option value="bennie2390/Qwen-Image-Edit-Rapid-AIO-Loras-Experimental">Qwen-Image-Edit Rapid AIO & LoRAs (Experimental)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-slate-200 mb-2 block">Main Reference Image</label>
                    {mainImage ? (
                      <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-950 border border-slate-800 group">
                        <img src={mainImage} alt="Main reference" className="w-full h-full object-cover" />
                        <button
                          onClick={() => setMainImage(null)}
                          className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-lg opacity-80 hover:opacity-100 transition"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <label 
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, setMainImage)}
                        className="border-2 border-dashed border-slate-700 hover:border-purple-500 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer bg-slate-950/50 transition"
                      >
                        <ImageIcon className="h-8 w-8 text-slate-500 mb-2" />
                        <span className="text-sm text-slate-300 font-medium">Upload or Drop main image</span>
                        <span className="text-xs text-slate-500 mt-1">PNG, JPG up to 20MB</span>
                        <input type="file" accept="image/*" onChange={handleMainImageUpload} className="hidden" />
                      </label>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-slate-200 mb-1.5 block">Extra Reference Images (Optional, up to 9)</label>
                    <div className="grid grid-cols-3 gap-2">
                      {extraImages.map((img, i) => (
                        <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-slate-950 border border-slate-800">
                          <img src={img} alt={`Extra ${i}`} className="w-full h-full object-cover" />
                          <button
                            onClick={() => setExtraImages(prev => prev.filter((_, idx) => idx !== i))}
                            className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded transition"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      {extraImages.length < 9 && (
                        <label 
                          onDragOver={handleDragOver}
                          onDrop={handleExtraDrop}
                          className="border border-dashed border-slate-700 hover:border-purple-500 rounded-lg aspect-square flex flex-col items-center justify-center cursor-pointer bg-slate-950/50 transition"
                        >
                          <Plus className="h-5 w-5 text-slate-500" />
                          <input type="file" accept="image/*" multiple onChange={handleExtraImagesUpload} className="hidden" />
                        </label>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-slate-200">Edit Instruction</label>
                    <button
                      onClick={() => handleEnhancePrompt(true, false)}
                      disabled={isEnhancing || !editPrompt.trim()}
                      className="text-xs text-purple-400 hover:text-purple-300 flex items-center space-x-1 disabled:opacity-50"
                    >
                      <Sparkles className="h-3 w-3" />
                      <span>{isEnhancing ? 'Enhancing...' : 'AI Enhance'}</span>
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    placeholder="e.g. Change the background to a sunset beach..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition resize-none"
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Steps ({editSteps})</label>
                      <input
                        type="range"
                        min={editSpace === 'bennie2390/Qwen-Image-Edit-Rapid-AIO-Loras-Experimental' ? 1 : 8}
                        max={50}
                        value={editSteps}
                        onChange={(e) => setEditSteps(Number(e.target.value))}
                        className="w-full accent-purple-500 cursor-pointer mt-2"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1.5 block">LoRA Scale ({editLoraScale})</label>
                      <input
                        type="range"
                        min={0.0}
                        max={1.5}
                        step={0.05}
                        value={editLoraScale}
                        onChange={(e) => setEditLoraScale(Number(e.target.value))}
                        className="w-full accent-purple-500 cursor-pointer mt-2"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleEdit}
                    disabled={isLoading}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:opacity-90 text-white font-bold text-base shadow-xl shadow-purple-600/30 transition flex items-center justify-center space-x-2 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="h-5 w-5 animate-spin" />
                        <span>Editing Image...</span>
                      </>
                    ) : (
                      <>
                        <Layers className="h-5 w-5" />
                        <span>Edit Image</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {activeTab === 'video' && (
                /* Video Generator Form (LTX 2.3) */
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-xl">
                  <div>
                    <label className="text-sm font-semibold text-slate-200 mb-2 block">Starting Reference Image (I2V)</label>
                    {vidImage ? (
                      <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-950 border border-slate-800 group">
                        <img src={vidImage} alt="Video reference" className="w-full h-full object-cover" />
                        <button
                          onClick={() => setVidImage(null)}
                          className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-lg opacity-80 hover:opacity-100 transition"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <label 
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, setVidImage)}
                        className="border-2 border-dashed border-slate-700 hover:border-pink-500 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer bg-slate-950/50 transition"
                      >
                        <Film className="h-8 w-8 text-pink-400 mb-2" />
                        <span className="text-sm text-slate-300 font-medium">Upload or Drop starting image</span>
                        <span className="text-xs text-slate-500 mt-1">Required for LTX 2.3 Video</span>
                        <input type="file" accept="image/*" onChange={handleVidImageUpload} className="hidden" />
                      </label>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-slate-200">Video Prompt</label>
                    <button
                      onClick={() => handleEnhancePrompt(false, true)}
                      disabled={isEnhancing || !vidPrompt.trim()}
                      className="text-xs text-pink-400 hover:text-pink-300 flex items-center space-x-1 disabled:opacity-50"
                    >
                      <Sparkles className="h-3 w-3" />
                      <span>{isEnhancing ? 'Enhancing...' : 'AI Enhance LTX Prompt'}</span>
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={vidPrompt}
                    onChange={(e) => setVidPrompt(e.target.value)}
                    placeholder="Describe the motion and scene for the video..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-pink-500 transition resize-none"
                  />

                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Negative Prompt</label>
                    <input
                      type="text"
                      value={vidNegative}
                      onChange={(e) => setVidNegative(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-300 focus:outline-none focus:border-pink-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Preset</label>
                      <select
                        value={vidPreset}
                        onChange={(e) => setVidPreset(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-pink-500"
                      >
                        {LTX_PRESETS.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Duration ({vidSeconds}s)</label>
                      <input
                        type="range"
                        min={1.0}
                        max={15.0}
                        step={0.5}
                        value={vidSeconds}
                        onChange={(e) => setVidSeconds(Number(e.target.value))}
                        className="w-full accent-pink-500 cursor-pointer mt-2"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Face Mode</label>
                      <select
                        value={vidMode}
                        onChange={(e) => setVidMode(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-pink-500"
                      >
                        <option value="anchor only">Anchor Only</option>
                        <option value="auto face">Auto Face</option>
                        <option value="manual bbox">Manual Bbox</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Seed (-1 = Random)</label>
                      <input
                        type="number"
                        value={vidSeed}
                        onChange={(e) => setVidSeed(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-pink-500"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleVideoGenerate}
                    disabled={isLoading}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 hover:opacity-90 text-white font-bold text-base shadow-xl shadow-pink-600/30 transition flex items-center justify-center space-x-2 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="h-5 w-5 animate-spin" />
                        <span>Generating LTX Video (ComfyUI)...</span>
                      </>
                    ) : (
                      <>
                        <Film className="h-5 w-5" />
                        <span>Generate Video (LTX 2.3)</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Right Preview Column */}
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col items-center justify-center min-h-[500px] relative">
                {isLoading ? (
                  <div className="text-center space-y-4 py-20">
                    <div className="relative w-20 h-20 mx-auto">
                      <div className="absolute inset-0 rounded-full border-4 border-purple-500/20 animate-pulse"></div>
                      <div className="absolute inset-0 rounded-full border-4 border-purple-500 border-t-transparent animate-spin"></div>
                      <Sparkles className="absolute inset-0 m-auto h-8 w-8 text-purple-400 animate-bounce" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-lg font-semibold text-slate-200">
                        {activeTab === 'video' ? 'Generating LTX 2.3 Video' : 'Generating Masterpiece'}
                      </h3>
                      <p className="text-xs text-slate-400 max-w-xs mx-auto">{loadingMessage}</p>
                    </div>
                  </div>
                ) : activeTab === 'video' && currentVideoResult ? (
                  <div className="w-full space-y-4">
                    <div className="relative aspect-square sm:aspect-[4/3] rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 group shadow-2xl flex items-center justify-center">
                      <video
                        src={currentVideoResult.videoUrl}
                        controls
                        autoPlay
                        loop
                        playsInline
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute top-4 right-4 flex space-x-2">
                        <button
                          onClick={() => setFullScreenMedia({ url: currentVideoResult.videoUrl, type: 'video' })}
                          className="p-2.5 bg-slate-900/80 hover:bg-slate-900 text-white rounded-xl backdrop-blur transition shadow-lg"
                        >
                          <Maximize2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between bg-slate-950 p-4 rounded-xl border border-slate-800/80 text-xs">
                      <div className="space-y-1">
                        <div className="text-slate-400">Used Seed: <span className="text-pink-300 font-mono font-semibold">{currentVideoResult.seed}</span></div>
                        <div className="text-slate-400">HF Token Used: <span className="text-slate-200 font-mono">{currentVideoResult.usedTokenMasked}</span></div>
                      </div>
                      <button
                        onClick={() => downloadMedia(currentVideoResult.videoUrl, 'video')}
                        className="px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white font-semibold rounded-lg transition flex items-center space-x-1.5 shadow"
                      >
                        <Download className="h-4 w-4" />
                        <span>Download MP4</span>
                      </button>
                    </div>
                  </div>
                ) : activeTab !== 'video' && currentResult ? (
                  <div className="w-full space-y-4">
                    <div className="relative aspect-square sm:aspect-[4/3] rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 group shadow-2xl">
                      <img
                        src={currentResult.imageUrl}
                        alt="Generated result"
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center space-x-4">
                        <button
                          onClick={() => {
                            setMainImage(currentResult.imageUrl);
                            setActiveTab('edit');
                          }}
                          className="p-3 bg-slate-900/80 hover:bg-slate-900 text-indigo-400 rounded-xl backdrop-blur transition shadow-lg transform hover:scale-105"
                          title="Edit"
                        >
                          <Layers className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => {
                            setVidImage(currentResult.imageUrl);
                            setActiveTab('video');
                          }}
                          className="p-3 bg-slate-900/80 hover:bg-slate-900 text-pink-400 rounded-xl backdrop-blur transition shadow-lg transform hover:scale-105"
                          title="Generate Video"
                        >
                          <Film className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => setFullScreenMedia({ url: currentResult.imageUrl, type: 'image' })}
                          className="p-3 bg-slate-900/80 hover:bg-slate-900 text-white rounded-xl backdrop-blur transition shadow-lg transform hover:scale-105"
                          title="Fullscreen View"
                        >
                          <Maximize2 className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => downloadMedia(currentResult.imageUrl, 'image')}
                          className="px-5 py-3 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl shadow-lg transition transform hover:scale-105 flex items-center space-x-2"
                        >
                          <Download className="h-5 w-5" />
                          <span>Download Instant</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between bg-slate-950 p-4 rounded-xl border border-slate-800/80 text-xs">
                      <div className="space-y-1">
                        <div className="text-slate-400">Used Seed: <span className="text-purple-300 font-mono font-semibold">{currentResult.seed}</span></div>
                        <div className="text-slate-400">HF Token Used: <span className="text-slate-200 font-mono">{currentResult.usedTokenMasked}</span></div>
                      </div>
                      <button
                        onClick={() => downloadMedia(currentResult.imageUrl, 'image')}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg transition flex items-center space-x-1.5"
                      >
                        <Download className="h-4 w-4" />
                        <span>Download</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-24 space-y-3">
                    <div className="h-16 w-16 rounded-2xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-center mx-auto text-slate-500">
                      {activeTab === 'video' ? <Film className="h-8 w-8 text-pink-400" /> : <ImageIcon className="h-8 w-8" />}
                    </div>
                    <h3 className="text-lg font-medium text-slate-300">
                      {activeTab === 'video' ? 'Your generated video will appear here' : 'Your artwork will appear here'}
                    </h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      {activeTab === 'video'
                        ? 'Upload a reference image, write a motion prompt, and click Generate Video (LTX 2.3).'
                        : 'Configure your prompt on the left, choose your settings, and click Generate.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {/* Settings Modal (HF Tokens Management) */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-6 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-2">
                <Key className="h-5 w-5 text-purple-400" />
                <h2 className="text-lg font-bold">Hugging Face Tokens Management</h2>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="text-slate-400 hover:text-slate-100 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-200 block mb-1">
                  Paste Hugging Face Tokens (One per line / Press Enter)
                </label>
                <p className="text-xs text-slate-400 mb-2">
                  Tokens are automatically rotated (cycled) if a quota or rate limit is reached, ensuring uninterrupted workflows across Qwen & LTX spaces.
                </p>
                <textarea
                  rows={5}
                  value={tokenInputText}
                  onChange={handleTokenTextChange}
                  placeholder="hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx&#10;hf_yyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-sm font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-500 transition resize-none"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Configured Tokens ({tokenStatuses.length})
                  </span>
                  <button
                    onClick={testAllTokens}
                    disabled={testingAll || tokenStatuses.length === 0}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${testingAll ? 'animate-spin' : ''}`} />
                    <span>Test All Validity</span>
                  </button>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {tokenStatuses.length === 0 ? (
                    <div className="text-center py-6 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-500">
                      No tokens added yet. Paste tokens above (optional).
                    </div>
                  ) : (
                    tokenStatuses.map((item, idx) => {
                      const masked = item.token.length > 10 ? `${item.token.substring(0, 6)}...${item.token.slice(-4)}` : '••••••••';
                      return (
                        <div key={idx} className="flex items-center justify-between bg-slate-950 px-4 py-2.5 rounded-xl border border-slate-800 text-xs">
                          <div className="flex items-center space-x-3">
                            <span className="font-mono text-slate-300">#{idx + 1} {masked}</span>
                            {item.status === 'valid' && (
                              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full border border-emerald-500/30 flex items-center space-x-1 font-medium">
                                <CheckCircle2 className="h-3 w-3" />
                                <span>Active & Valid</span>
                              </span>
                            )}
                            {item.status === 'invalid' && (
                              <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full border border-red-500/30 flex items-center space-x-1 font-medium" title={item.error}>
                                <XCircle className="h-3 w-3" />
                                <span>Invalid / Error</span>
                              </span>
                            )}
                            {item.status === 'untested' && (
                              <span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded-full border border-slate-700">
                                Untested
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => testToken(idx)}
                            disabled={testingTokenIdx === idx}
                            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium transition flex items-center space-x-1"
                          >
                            {testingTokenIdx === idx ? <RefreshCw className="h-3 w-3 animate-spin" /> : <span>Test</span>}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="border-t border-slate-800 pt-5">
                <label className="text-sm font-medium text-slate-200 block mb-1">
                  Gemini API Keys (One per line / Press Enter)
                </label>
                <p className="text-xs text-slate-400 mb-2">
                  Used for AI Prompt Enhancement. Keys are automatically rotated (cycled) if rate limits or quota errors occur.
                </p>
                <textarea
                  rows={4}
                  value={geminiKeyInputText}
                  onChange={handleGeminiKeyTextChange}
                  placeholder="AIzaSy...&#10;AIzaSy..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-sm font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-500 transition resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-800">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-semibold transition"
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Screen Media Modal */}
      {fullScreenMedia && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative max-w-5xl max-h-[90vh] w-full h-full flex items-center justify-center">
            {fullScreenMedia.type === 'video' ? (
              <video src={fullScreenMedia.url} controls autoPlay loop className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" />
            ) : (
              <img src={fullScreenMedia.url} alt="Fullscreen preview" className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" />
            )}
            <div className="absolute top-4 right-4 flex space-x-3">
              <button
                onClick={() => downloadMedia(fullScreenMedia.url, fullScreenMedia.type)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl flex items-center space-x-2 shadow-lg transition"
              >
                <Download className="h-4 w-4" />
                <span>Download</span>
              </button>
              <button
                onClick={() => setFullScreenMedia(null)}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
