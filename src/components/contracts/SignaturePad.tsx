'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import SignaturePadLib from 'signature_pad'

export interface SignaturePadHandle {
  isEmpty(): boolean
  toDataURL(): string
  clear(): void
}

const SignaturePad = forwardRef<SignaturePadHandle, { className?: string }>(
  ({ className }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const padRef = useRef<SignaturePadLib | null>(null)

    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return

      const init = () => {
        const ratio = Math.max(window.devicePixelRatio || 1, 1)
        canvas.width = canvas.offsetWidth * ratio
        canvas.height = canvas.offsetHeight * ratio
        canvas.getContext('2d')?.scale(ratio, ratio)
        if (padRef.current) {
          padRef.current.off()
        }
        padRef.current = new SignaturePadLib(canvas, {
          backgroundColor: 'rgb(255,255,255)',
          penColor: '#111827',
          minWidth: 1.5,
          maxWidth: 3,
        })
      }

      init()

      const handleResize = () => {
        if (!padRef.current) return
        const data = padRef.current.toData()
        init()
        padRef.current.fromData(data)
      }
      window.addEventListener('resize', handleResize)
      return () => {
        window.removeEventListener('resize', handleResize)
        padRef.current?.off()
      }
    }, [])

    useImperativeHandle(ref, () => ({
      isEmpty: () => padRef.current?.isEmpty() ?? true,
      toDataURL: () => padRef.current?.toDataURL('image/png') ?? '',
      clear: () => padRef.current?.clear(),
    }))

    return (
      <div className={`relative ${className ?? ''}`}>
        <canvas
          ref={canvasRef}
          className="w-full border border-border rounded-xl bg-white touch-none cursor-crosshair"
          style={{ height: 160 }}
        />
      </div>
    )
  },
)

SignaturePad.displayName = 'SignaturePad'
export default SignaturePad
