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

const MAP_APPS = [
  { id: 'naver'  as const, name: '네이버지도', bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200', icon: '🟢' },
  { id: 'kakao'  as const, name: '카카오맵',   bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', icon: '🟡' },
  { id: 'google' as const, name: '구글지도',   bg: 'bg-blue-50',  text: 'text-blue-700',   border: 'border-blue-200',   icon: '🔵' },
  { id: 'tmap'   as const, name: 'T맵',        bg: 'bg-red-50',   text: 'text-red-700',    border: 'border-red-200',    icon: '🔴' },
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
          {MAP_APPS.map(app => (
            <button
              key={app.id}
              onClick={() => { openApp(app.id, address); onClose() }}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl border font-medium text-sm transition-opacity active:opacity-70 ${app.bg} ${app.text} ${app.border}`}
            >
              <span className="text-base">{app.icon}</span>
              <span>{app.name}</span>
            </button>
          ))}
        </div>
        <p className="text-center text-xs text-gray-400 mt-3">설치된 앱이 없으면 스토어로 이동합니다</p>
      </div>
    </div>
  )
}
