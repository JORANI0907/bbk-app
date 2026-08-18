'use client'

/**
 * KB에스크로 이체 인증마크 — 소비자에게 판매자가 KB국민은행 에스크로 서비스에
 * 가입되어 있음을 표시. 클릭 시 KB에스크로 판매자 검증 팝업이 뜬다.
 * mHValue 는 BBK 사업자 고유 해시(2026-08-12 발급).
 */
const KB_ESCROW_URL = 'https://okbfex.kbstar.com/quics'
const KB_ESCROW_PARAMS = {
  page: 'C021590',
  cc: 'b034066:b035526',
  mHValue: '25a2fdfaf136fea808e1eb7aacb31051',
}
const KB_ESCROW_IMG = 'https://img1.kbstar.com/img/escrow/escrowcmark.gif'

function openKbEscrowPopup() {
  const qs = new URLSearchParams(KB_ESCROW_PARAMS).toString()
  window.open(
    `${KB_ESCROW_URL}?${qs}`,
    'KB_AUTHMARK',
    'height=604,width=648,status=yes,toolbar=no,menubar=no,location=no'
  )
}

interface Props {
  /** 밝은 배경(light) vs 어두운 배경(dark). 어두운 배경에서는 옆에 안내 텍스트가 흐린 흰색으로 표시됨. */
  theme?: 'light' | 'dark'
  /** 클릭 안내 라벨 노출 여부 (기본 노출). */
  showLabel?: boolean
}

export function KbEscrowBadge({ theme = 'light', showLabel = true }: Props) {
  const labelColor = theme === 'dark' ? 'text-white/40' : 'text-text-tertiary'

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={openKbEscrowPopup}
        title="KB국민은행 에스크로 판매자 인증 확인"
        className="inline-flex items-center hover:opacity-80 transition-opacity"
      >
        <img
          src={KB_ESCROW_IMG}
          alt="KB국민은행 에스크로 이체 인증마크"
          width={70}
          height={30}
          loading="lazy"
          decoding="async"
          className="h-8 w-auto"
        />
      </button>
      {showLabel && (
        <span className={`text-[10px] leading-tight ${labelColor}`}>
          KB에스크로 가입 판매자<br />(클릭 시 판매자 검증)
        </span>
      )}
    </span>
  )
}
