import React, { useState, useEffect, useRef } from 'react';
import { Film, Play, Pause, AlertTriangle } from 'lucide-react';
import { useBlobMediaUrl, createVideoThumbnail } from '../utils/mediaBlobUrl';
import { fetchUrlToBlob } from '../services/huggingFaceService';

interface GalleryVideoPreviewProps {
  id: string;
  videoBlob?: Blob;
  videoUrl?: string;
  thumbnailUrl?: string;
  prompt: string;
  onThumbnailGenerated?: (id: string, thumbnailUrl: string) => void;
  onVideoBlobRecovered?: (id: string, blob: Blob) => void;
}

// Serialize background thumbnail extraction & recovery so decoders/network don't compete
let thumbnailQueue: Promise<void> = Promise.resolve();

export const GalleryVideoPreview: React.FC<GalleryVideoPreviewProps> = ({
  id,
  videoBlob,
  videoUrl,
  thumbnailUrl,
  prompt,
  onThumbnailGenerated,
  onVideoBlobRecovered,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isManualPlaying, setIsManualPlaying] = useState(false);
  const [localThumb, setLocalThumb] = useState<string | undefined>(thumbnailUrl);
  const [isExpired, setIsExpired] = useState(false);

  const isTempHttpUrl = Boolean(!videoBlob && videoUrl && !videoUrl.startsWith('data:'));
  const mediaSource = videoBlob || videoUrl;

  useEffect(() => {
    if (thumbnailUrl) {
      setLocalThumb(thumbnailUrl);
    }
  }, [thumbnailUrl]);

  // If this is a legacy item saved with an HTTP temp URL (no Blob and no Base64),
  // attempt one-time recovery into a permanent binary Blob when visible; otherwise mark expired.
  useEffect(() => {
    if (!isTempHttpUrl || !videoUrl || isExpired) return;
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          thumbnailQueue = thumbnailQueue.then(async () => {
            if (cancelled) return;
            try {
              const recoveredBlob = await fetchUrlToBlob(videoUrl);
              if (!cancelled && recoveredBlob) {
                onVideoBlobRecovered?.(id, recoveredBlob);
              }
            } catch {
              if (!cancelled) {
                setIsExpired(true);
              }
            }
          });
        }
      },
      { rootMargin: '120px' }
    );

    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [id, isTempHttpUrl, videoUrl, isExpired, onVideoBlobRecovered]);

  // Capture missing thumbnail sequentially when visible
  useEffect(() => {
    if (localThumb || !mediaSource || isExpired) return;
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          thumbnailQueue = thumbnailQueue.then(async () => {
            if (cancelled) return;
            const thumb = await createVideoThumbnail(mediaSource);
            if (!cancelled && thumb) {
              setLocalThumb(thumb);
              onThumbnailGenerated?.(id, thumb);
            }
          });
        }
      },
      { rootMargin: '120px' }
    );

    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [id, mediaSource, localThumb, isExpired, onThumbnailGenerated]);

  const shouldPlay = Boolean(mediaSource && !isExpired && (isHovering || isManualPlaying));
  const activeBlobUrl = useBlobMediaUrl(mediaSource, shouldPlay);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-slate-950 flex items-center justify-center"
      onMouseEnter={() => {
        if (!isExpired) setIsHovering(true);
      }}
      onMouseLeave={() => setIsHovering(false)}
    >
      {localThumb ? (
        <img
          src={localThumb}
          alt={prompt}
          className={`w-full h-full object-cover transition duration-300 ${
            isExpired ? 'opacity-50 grayscale' : 'group-hover:scale-105'
          }`}
        />
      ) : (
        <div className="flex flex-col items-center justify-center text-slate-600 space-y-1.5">
          <Film className="h-8 w-8 text-pink-400/70" />
          <span className="text-[10px] uppercase tracking-wider text-slate-500">
            {isExpired ? 'Video Expired' : 'Video Ready'}
          </span>
        </div>
      )}

      {shouldPlay && activeBlobUrl && (
        <video
          src={activeBlobUrl}
          className="absolute inset-0 w-full h-full object-cover z-10"
          muted
          loop
          autoPlay
          playsInline
          onError={() => {
            if (isTempHttpUrl) setIsExpired(true);
          }}
        />
      )}

      {isExpired ? (
        <div
          className="absolute z-30 px-2.5 py-1 rounded-full bg-amber-950/90 border border-amber-500/40 text-amber-300 text-[10px] font-semibold flex items-center space-x-1 shadow-lg"
          title="File video lama hanya tersimpan sebagai link temp Gradio yang sudah kedaluwarsa di server."
        >
          <AlertTriangle className="h-3 w-3" />
          <span>Link Temp Kedaluwarsa</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsManualPlaying((prev) => !prev);
          }}
          title={shouldPlay ? 'Pause Preview' : 'Play Preview'}
          className={`absolute z-30 p-3 rounded-full bg-slate-950/70 hover:bg-pink-600/90 text-white backdrop-blur-sm border border-white/15 shadow-lg transition ${
            shouldPlay ? 'opacity-0 group-hover:opacity-100' : 'opacity-90 hover:scale-110'
          }`}
        >
          {shouldPlay ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current ml-0.5" />}
        </button>
      )}
    </div>
  );
};
