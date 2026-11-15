import React, { useState, useEffect, useRef } from 'react';
import { Film, Play, Pause } from 'lucide-react';
import { useBlobMediaUrl, createVideoThumbnail } from '../utils/mediaBlobUrl';

interface GalleryVideoPreviewProps {
  id: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  prompt: string;
  onThumbnailGenerated?: (id: string, thumbnailUrl: string) => void;
}

// Serialize background thumbnail extraction for legacy items so decoders don't compete
let thumbnailQueue: Promise<void> = Promise.resolve();

export const GalleryVideoPreview: React.FC<GalleryVideoPreviewProps> = ({
  id,
  videoUrl,
  thumbnailUrl,
  prompt,
  onThumbnailGenerated,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isManualPlaying, setIsManualPlaying] = useState(false);
  const [localThumb, setLocalThumb] = useState<string | undefined>(thumbnailUrl);

  useEffect(() => {
    if (thumbnailUrl) {
      setLocalThumb(thumbnailUrl);
    }
  }, [thumbnailUrl]);

  // For legacy videos without a saved thumbnail, capture one sequentially when visible
  useEffect(() => {
    if (localThumb || !videoUrl) return;
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          thumbnailQueue = thumbnailQueue.then(async () => {
            if (cancelled) return;
            const thumb = await createVideoThumbnail(videoUrl);
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
  }, [id, videoUrl, localThumb, onThumbnailGenerated]);

  const shouldPlay = Boolean(videoUrl && (isHovering || isManualPlaying));
  const activeBlobUrl = useBlobMediaUrl(videoUrl, shouldPlay);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-slate-950 flex items-center justify-center"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {localThumb ? (
        <img
          src={localThumb}
          alt={prompt}
          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
        />
      ) : (
        <div className="flex flex-col items-center justify-center text-slate-600 space-y-1.5">
          <Film className="h-8 w-8 text-pink-400/70" />
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Video Ready</span>
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
        />
      )}

      {/* Center Play/Pause indicator for tap-to-preview (mobile) & visual clarity */}
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
    </div>
  );
};
