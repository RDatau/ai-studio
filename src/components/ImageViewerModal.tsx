import React, { useState, useEffect, useRef } from 'react';
import { Download, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface ImageViewerModalProps {
  media: { url: string; type: 'image' | 'video' } | null;
  onClose: () => void;
  onDownload: (url: string, type: 'image' | 'video') => void;
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({
  media,
  onClose,
  onDownload,
}) => {
  if (!media) return null;

  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchPinchDistRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset zoom & pan when media changes or opens
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [media?.url]);

  const handleZoom = (delta: number) => {
    setScale(prev => {
      const nextScale = Math.min(Math.max(prev + delta, 0.5), 6);
      if (nextScale <= 1) setPosition({ x: 0, y: 0 });
      return nextScale;
    });
  };

  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // Wheel event for direct scroll zooming
  useEffect(() => {
    const container = containerRef.current;
    if (!container || media.type !== 'image') return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 0.2 : -0.2;
      setScale(prev => {
        const nextScale = Math.min(Math.max(prev + zoomFactor, 0.5), 6);
        if (nextScale <= 1) setPosition({ x: 0, y: 0 });
        return nextScale;
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [media?.type]);

  // Mouse pan handling
  const handleMouseDown = (e: React.MouseEvent) => {
    if (media.type !== 'image') return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || media.type !== 'image') return;
    setPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch pan & pinch-zoom handling for Mobile / Android WebApp
  const handleTouchStart = (e: React.TouchEvent) => {
    if (media.type !== 'image') return;
    if (e.touches.length === 1) {
      setIsDragging(true);
      dragStartRef.current = {
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y,
      };
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchPinchDistRef.current = dist;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (media.type !== 'image') return;
    if (e.touches.length === 1 && isDragging) {
      setPosition({
        x: e.touches[0].clientX - dragStartRef.current.x,
        y: e.touches[0].clientY - dragStartRef.current.y,
      });
    } else if (e.touches.length === 2 && touchPinchDistRef.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = (dist - touchPinchDistRef.current) * 0.01;
      touchPinchDistRef.current = dist;
      setScale(prev => {
        const nextScale = Math.min(Math.max(prev + factor, 0.5), 6);
        if (nextScale <= 1) setPosition({ x: 0, y: 0 });
        return nextScale;
      });
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    touchPinchDistRef.current = null;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 select-none">
      <div
        ref={containerRef}
        className="relative w-full h-full flex items-center justify-center overflow-hidden touch-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="transition-transform duration-75 ease-out origin-center"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            cursor: media.type === 'image' ? (isDragging ? 'grabbing' : 'grab') : 'default',
          }}
        >
          {media.type === 'video' ? (
            <video
              src={media.url}
              controls
              autoPlay
              loop
              playsInline
              className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl pointer-events-auto"
            />
          ) : (
            <img
              src={media.url}
              alt="Fullscreen preview"
              draggable={false}
              className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl pointer-events-none"
            />
          )}
        </div>
      </div>

      {/* Floating Toolbar: Zoom Controls for Images */}
      {media.type === 'image' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-900/90 backdrop-blur-lg rounded-full px-4 py-2 border border-slate-700/80 shadow-2xl z-20">
          <button
            onClick={() => handleZoom(-0.2)}
            className="p-2 hover:bg-slate-800 text-slate-200 hover:text-white rounded-full transition active:scale-95"
            title="Zoom Out (-)"
          >
            <ZoomOut className="h-4 w-4" />
          </button>

          <span className="text-xs font-mono font-bold text-slate-200 w-14 text-center select-none">
            {Math.round(scale * 100)}%
          </span>

          <button
            onClick={() => handleZoom(0.2)}
            className="p-2 hover:bg-slate-800 text-slate-200 hover:text-white rounded-full transition active:scale-95"
            title="Zoom In (+)"
          >
            <ZoomIn className="h-4 w-4" />
          </button>

          <div className="w-px h-5 bg-slate-700 mx-1" />

          <button
            onClick={handleReset}
            className="px-3 py-1 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 rounded-full transition active:scale-95 flex items-center gap-1.5"
            title="Reset Zoom & Position"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>
        </div>
      )}

      {/* Top Right Action Buttons (Download & Close) */}
      <div className="absolute top-4 right-4 flex items-center space-x-2 sm:space-x-3 z-20">
        <button
          onClick={() => onDownload(media.url, media.type)}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs sm:text-sm font-semibold rounded-xl flex items-center space-x-2 shadow-lg transition active:scale-95"
        >
          <Download className="h-4 w-4" />
          <span>Download</span>
        </button>
        <button
          onClick={onClose}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl transition shadow-lg active:scale-95"
          title="Tutup Preview"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};
