/**
 * 지도 및 Google Drive 앱 열기 유틸리티
 * 모바일에서는 네이티브 앱 딥링크를 시도하고, 앱이 없으면 스토어로 이동합니다.
 */

function isMobile(): boolean {
  return /Android|iPhone|iPad/i.test(navigator.userAgent)
}

function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent)
}

/**
 * 주소를 네이버지도에서 검색합니다.
 * 모바일에서는 앱 딥링크 시도 → 실패 시 스토어 이동.
 * PC에서는 웹 브라우저로 엽니다.
 */
export function openNaverMap(address: string): void {
  const encoded = encodeURIComponent(address)

  if (!isMobile()) {
    window.open(`https://map.naver.com/v5/search/${encoded}`, '_blank')
    return
  }

  // 모바일: 앱 딥링크 먼저 시도
  window.location.href = `nmap://search?query=${encoded}&appname=com.bbkorea.app`

  // 2초 후 앱이 열리지 않으면 스토어로 이동
  setTimeout(() => {
    window.location.href = isAndroid()
      ? 'market://details?id=com.nhn.android.nmap'
      : 'https://apps.apple.com/kr/app/naver-map-navigation/id311867728'
  }, 2000)
}

/**
 * Google Drive 파일/폴더를 엽니다.
 * 모바일에서는 Drive 앱 딥링크 시도 → 실패 시 스토어 이동.
 * PC에서는 웹 브라우저로 엽니다.
 */
export function openGoogleDrive(url: string): void {
  if (!url) return

  if (!isMobile()) {
    window.open(url, '_blank')
    return
  }

  // Google Drive 파일/폴더 ID 추출
  const fileId =
    url.match(/\/d\/([^/?#]+)/)?.[1] ||
    url.match(/[?&]id=([^&]+)/)?.[1] ||
    url.match(/\/folders\/([^/?#]+)/)?.[1]

  if (fileId) {
    window.location.href = `googledrive://open?id=${fileId}`
    setTimeout(() => {
      window.location.href = isAndroid()
        ? 'market://details?id=com.google.android.apps.docs'
        : 'https://apps.apple.com/kr/app/google-drive/id507874739'
    }, 2000)
  } else {
    window.open(url, '_blank')
  }
}
