import { useState, useEffect } from 'react';

/**
 * Converts a Base64 Data URL (e.g. data:video/mp4;base64,...) into a binary Blob.
 */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    if (!dataUrl || !dataUrl.startsWith('data:')) return null;
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) return null;

    const header = dataUrl.slice(0, commaIdx);
    const base64 = dataUrl.slice(commaIdx + 1);
    const mimeMatch = header.match(/data:([^;]+)/i);
    const mime = mimeMatch ? mimeMatch[1] : 'video/mp4';

    const binaryStr = atob(base64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  } catch (err) {
    console.warn('Failed to convert Data URL to Blob:', err);
    return null;
  }
}

/**
 * React hook that converts a Base64 Data URL to a temporary Blob URL only while `enabled` is true,
 * and revokes the Blob URL automatically on disable or unmount to keep memory/decoder load minimal.
 */
export function useBlobMediaUrl(src: string | null | undefined, enabled: boolean = true): string | undefined {
  const [resolvedUrl, setResolvedUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!enabled || !src) {
      setResolvedUrl(undefined);
      return;
    }

    if (!src.startsWith('data:')) {
      setResolvedUrl(src);
      return;
    }

    const blob = dataUrlToBlob(src);
    if (!blob) {
      setResolvedUrl(src);
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    setResolvedUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [src, enabled]);

  return resolvedUrl;
}

/**
 * Compresses an image Data URL into a lightweight JPEG Base64 thumbnail.
 */
export async function compressImageToThumbnail(imageUrl: string, maxDim: number = 480): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

/**
 * Extracts a lightweight JPEG Base64 thumbnail from the first decoded frame of a video.
 * Uses a temporary Blob URL and cleans it up immediately after capture.
 */
export async function createVideoThumbnail(videoSrc: string, maxDim: number = 480): Promise<string | null> {
  if (!videoSrc) return null;

  let tempBlobUrl: string | null = null;
  let effectiveSrc = videoSrc;

  if (videoSrc.startsWith('data:')) {
    const blob = dataUrlToBlob(videoSrc);
    if (blob) {
      tempBlobUrl = URL.createObjectURL(blob);
      effectiveSrc = tempBlobUrl;
    }
  }

  return new Promise((resolve) => {
    const video = document.createElement('video');
    let settled = false;

    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
      if (tempBlobUrl) {
        URL.revokeObjectURL(tempBlobUrl);
        tempBlobUrl = null;
      }
    };

    const finish = (result: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      cleanup();
      resolve(result);
    };

    const timeoutId = setTimeout(() => finish(null), 6000);

    const captureFrame = () => {
      try {
        if (!video.videoWidth || !video.videoHeight) {
          finish(null);
          return;
        }
        const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
        const width = Math.max(1, Math.round(video.videoWidth * scale));
        const height = Math.max(1, Math.round(video.videoHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(null);
          return;
        }
        ctx.drawImage(video, 0, 0, width, height);
        const thumb = canvas.toDataURL('image/jpeg', 0.8);
        finish(thumb);
      } catch {
        finish(null);
      }
    };

    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';

    video.onloadeddata = () => {
      if (video.duration && video.duration > 0.15) {
        video.currentTime = 0.1;
      } else {
        captureFrame();
      }
    };

    video.onseeked = captureFrame;
    video.onerror = () => finish(null);

    video.src = effectiveSrc;
  });
}
