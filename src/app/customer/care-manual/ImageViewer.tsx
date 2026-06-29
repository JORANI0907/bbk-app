'use client'

import { useState } from 'react'
import { X, Maximize2 } from 'lucide-react'

interface Props {
  src: string
  alt: string
  variant?: 'section' | 'item'
}

function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
      >
        <X size={20} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="max-w-full max-h-[90vh] object-contain rounded-xl"
        onClick={e => e.stopPropagation()}
      />
    </div>
  )
}

export function ImageViewer({ src, alt, variant = 'section' }: Props) {
  const [open, setOpen] = useState(false)

  if (variant === 'item') {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="block rounded-lg overflow-hidden border border-border-subtle active:scale-[0.98] transition-transform"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-20 w-auto object-contain" />
        </button>
        {open && <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
      </>
    )
  }

  return (
    <>
      {/* 섹션 이미지 — 16:9 고정 비율 */}
      <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-border-subtle">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="w-full h-full object-cover" />
        {/* 확대 버튼 — amber 튀는 색상 */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="absolute top-2 right-2 p-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-black transition-colors shadow-sm active:scale-95"
          title="확대 보기"
        >
          <Maximize2 size={14} />
        </button>
      </div>
      {open && <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  )
}
