'use client'

/**
 * 지도 앱 선택 모달
 * 모바일에서 설치된 앱 중 선택, PC에서는 웹 버전으로 이동
 */

interface Props {
  address: string
  onClose: () => void
}

function isAndroid(): boolean { return /Android/i.test(navigator.userAgent) }
function isIOS(): boolean { return /iPhone|iPad/i.test(navigator.userAgent) }

function openApp(type: 'naver' | 'kakao' | 'google' | 'tmap', address: string): void {
  const enc = encodeURIComponent(address)
  const mobile = isAndroid() || isIOS()

  const webUrls: Record<string, string> = {
    naver:  `https://map.naver.com/v5/search/${enc}`,
    kakao:  `https://map.kakao.com/?q=${enc}`,
    google: `https://maps.google.com/?q=${enc}`,
    tmap:   `https://tmap.life/searchResult?keyword=${enc}`,
  }

  if (!mobile) {
    window.open(webUrls[type], '_blank')
    return
  }

  const deepLinks: Record<string, string> = {
    naver:  `nmap://search?query=${enc}&appname=com.bbkorea.app`,
    kakao:  `kakaomap://search?q=${enc}`,
    google: isIOS()
      ? `comgooglemaps://?q=${enc}`
      : `intent://maps.google.com/?q=${enc}#Intent;scheme=https;package=com.google.android.apps.maps;end`,
    tmap:   `tmap://search?searchKeyword=${enc}`,
  }

  const storeUrls: Record<string, string> = {
    naver:  isAndroid()
      ? 'market://details?id=com.nhn.android.nmap'
      : 'https://apps.apple.com/kr/app/naver-map-navigation/id311867728',
    kakao:  isAndroid()
      ? 'market://details?id=net.daum.android.map'
      : 'https://apps.apple.com/kr/app/kakaomap/id304608425',
    google: isAndroid()
      ? 'market://details?id=com.google.android.apps.maps'
      : 'https://apps.apple.com/kr/app/google-maps/id585027354',
    tmap:   isAndroid()
      ? 'market://details?id=com.skt.tmap.global'
      : 'https://apps.apple.com/kr/app/tmap/id431589174',
  }

  window.location.href = deepLinks[type]
  setTimeout(() => { window.location.href = storeUrls[type] }, 2000)
}

const NaverIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" rx="5" fill="#03C75A"/>
    <path d="M13.4 12.5L10.4 7H7v10h3.6V11.5l3.1 5.5H17V7h-3.6v5.5z" fill="white"/>
  </svg>
)

const KakaoIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" rx="5" fill="#FFCD00"/>
    <path d="M12 4.5C7.8 4.5 4.5 7.3 4.5 10.7c0 2.2 1.4 4.1 3.5 5.2l-.8 3.1 3.6-2.2c.4.1.8.1 1.2.1 4.2 0 7.5-2.8 7.5-6.2S16.2 4.5 12 4.5z" fill="#3A1D1D"/>
  </svg>
)

const GoogleIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" rx="5" fill="white" stroke="#E5E7EB"/>
    <path d="M20.6 12.2c0-.7-.1-1.3-.2-2H12v3.6h4.8c-.2 1.1-.9 2-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5z" fill="#4285F4"/>
    <path d="M12 21c2.4 0 4.4-.8 5.9-2.2l-2.9-2.2c-.8.5-1.8.9-3 .9-2.3 0-4.3-1.6-5-3.7H4v2.3C5.5 19.1 8.5 21 12 21z" fill="#34A853"/>
    <path d="M7 13.8c-.2-.5-.3-1-.3-1.6s.1-1.1.3-1.6V8.3H4c-.6 1.2-1 2.5-1 3.9s.4 2.7 1 3.9l3-2.3z" fill="#FBBC05"/>
    <path d="M12 6.9c1.3 0 2.5.5 3.4 1.3l2.5-2.5C16.4 4.2 14.4 3.3 12 3.3c-3.5 0-6.5 1.9-8 4.9l3 2.3c.7-2.1 2.7-3.6 5-3.6z" fill="#EA4335"/>
  </svg>
)

const TmapIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" rx="5" fill="#E00000"/>
    <path d="M5 8.5h14v2H13.5V17h-3V10.5H5V8.5z" fill="white"/>
  </svg>
)

const MAP_APPS = [
  { id: 'naver'  as const, name: '네이버지도', bg: 'bg-green-50',  text: 'text-green-800',  border: 'border-green-200', Icon: NaverIcon  },
  { id: 'kakao'  as const, name: '카카오맵',   bg: 'bg-yellow-50', text: 'text-yellow-900', border: 'border-yellow-200', Icon: KakaoIcon  },
  { id: 'google' as const, name: '구글지도',   bg: 'bg-gray-50',  text: 'text-gray-800',   border: 'border-gray-200',   Icon: GoogleIcon },
  { id: 'tmap'   as const, name: 'T맵',        bg: 'bg-red-50',   text: 'text-red-800',    border: 'border-red-200',    Icon: TmapIcon   },
]

export function MapSelectorModal({ address, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white w-full max-w-sm rounded-t-2xl md:rounded-2xl shadow-2xl p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-gray-900">지도 앱 선택</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <p className="text-xs text-gray-500 truncate mb-4 bg-gray-50 px-2 py-1 rounded">{address}</p>
        <div className="grid grid-cols-2 gap-2">
          {MAP_APPS.map(({ id, name, bg, text, border, Icon }) => (
            <button
              key={id}
              onClick={() => { openApp(id, address); onClose() }}
              className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border font-medium text-sm transition-opacity active:opacity-70 ${bg} ${text} ${border}`}
            >
              <Icon />
              <span>{name}</span>
            </button>
          ))}
        </div>
        <p className="text-center text-xs text-gray-400 mt-3">설치된 앱이 없으면 스토어로 이동합니다</p>
      </div>
    </div>
  )
}
