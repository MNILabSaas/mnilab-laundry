'use client';

import { useEffect, useRef } from 'react';

/**
 * TransparentHeroVideo
 * Memutar video KV (/Assets/video.webm) secara native. Background studio abu-abu terang
 * (±RGB 226–250) dinaikkan ke putih murni lewat filter brightness/contrast, lalu
 * mix-blend-mode multiply + mask radial membuat sisa tepinya larut ke kanvas #ffffff.
 */
export default function TransparentHeroVideo() {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.defaultMuted = true;
    video.muted = true;
    video.play().catch(() => {
      // Autoplay diblokir browser; video tetap menampilkan frame pertama
    });
  }, []);

  return (
    <div className="relative w-full flex items-center justify-center isolate bg-[#ffffff]">
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        className="w-full h-auto max-h-[38svh] lg:max-h-[72svh] object-contain pointer-events-none select-none"
        style={{
          mixBlendMode: 'multiply',
          filter: 'brightness(1.14) contrast(1.06) saturate(1.05)',
          WebkitMaskImage:
            'radial-gradient(ellipse 72% 72% at 50% 50%, #000 62%, transparent 100%)',
          maskImage: 'radial-gradient(ellipse 72% 72% at 50% 50%, #000 62%, transparent 100%)',
        }}
      >
        <source src="/Assets/video.webm" type="video/webm" />
        <source src="/Assets/VideoKV.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
