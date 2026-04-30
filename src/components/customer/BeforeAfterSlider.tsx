'use client'

import {
  ReactCompareSlider,
  ReactCompareSliderImage,
} from 'react-compare-slider'

interface Props {
  beforeUrl: string
  afterUrl: string
  label?: string
}

export function BeforeAfterSlider({ beforeUrl, afterUrl, label }: Props) {
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <h3 className="text-sm font-semibold text-text-primary">{label}</h3>
      )}
      <div className="rounded-2xl overflow-hidden border border-border-subtle shadow-soft">
        <ReactCompareSlider
          itemOne={
            <ReactCompareSliderImage
              src={beforeUrl}
              alt="작업 전"
              style={{ objectFit: 'cover' }}
            />
          }
          itemTwo={
            <ReactCompareSliderImage
              src={afterUrl}
              alt="작업 후"
              style={{ objectFit: 'cover' }}
            />
          }
          style={{
            width: '100%',
            aspectRatio: '4/3',
          }}
        />
      </div>
      <div className="flex justify-between text-xs text-text-tertiary px-1">
        <span className="bg-surface-sunken px-2 py-0.5 rounded-full">◀ Before</span>
        <span className="bg-brand-100 text-brand-600 px-2 py-0.5 rounded-full">After ▶</span>
      </div>
    </div>
  )
}
