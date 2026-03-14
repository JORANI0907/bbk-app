// Google Drive API + Picker 연동 유틸리티
// 필요 env: NEXT_PUBLIC_GOOGLE_CLIENT_ID, NEXT_PUBLIC_GOOGLE_API_KEY

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''
export const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? ''

export interface DriveFolder {
  id: string
  name: string
}

let _scriptsLoaded = false

/** Google API 스크립트 로드 (gapi.picker + Google Identity Services) */
export function loadGoogleAPIs(): Promise<void> {
  if (_scriptsLoaded) return Promise.resolve()
  if (typeof window === 'undefined') return Promise.reject(new Error('서버에서는 실행 불가'))

  return new Promise<void>((resolve, reject) => {
    let gapiReady = false
    let gisReady = false
    const check = () => {
      if (gapiReady && gisReady) { _scriptsLoaded = true; resolve() }
    }

    const addScript = (src: string, onLoad: () => void) => {
      const s = document.createElement('script')
      s.src = src
      s.async = true
      s.onload = onLoad
      s.onerror = () => reject(new Error(`스크립트 로드 실패: ${src}`))
      document.head.appendChild(s)
    }

    addScript('https://apis.google.com/js/api.js', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).gapi.load('picker', () => { gapiReady = true; check() })
    })
    addScript('https://accounts.google.com/gsi/client', () => {
      gisReady = true; check()
    })
  })
}

/** OAuth2 액세스 토큰 요청 (Google 로그인 팝업) */
export function requestGoogleToken(): Promise<string> {
  if (!GOOGLE_CLIENT_ID) {
    return Promise.reject(new Error(
      'NEXT_PUBLIC_GOOGLE_CLIENT_ID가 설정되지 않았습니다.\n.env.local과 Netlify 환경변수를 확인해주세요.'
    ))
  }
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google
    const tokenClient = g.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive',
      callback: (resp: { access_token?: string; error?: string }) => {
        if (resp.error) reject(new Error(`Google 인증 실패: ${resp.error}`))
        else resolve(resp.access_token!)
      },
    })
    tokenClient.requestAccessToken()
  })
}

/** Google Picker로 폴더 선택 */
export function openFolderPicker(accessToken: string): Promise<DriveFolder | null> {
  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google
    const view = new g.picker.DocsView(g.picker.ViewId.FOLDERS)
      .setSelectFolderEnabled(true)
      .setIncludeFolders(true)
      .setMimeTypes('application/vnd.google-apps.folder')

    const builder = new g.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setTitle('저장할 Google Drive 폴더 선택')
      .setCallback((data: { action: string; docs?: Array<{ id: string; name: string }> }) => {
        if (data.action === 'picked' && data.docs?.[0]) {
          resolve({ id: data.docs[0].id, name: data.docs[0].name })
        } else if (data.action === 'cancel') {
          resolve(null)
        }
      })

    if (GOOGLE_API_KEY) builder.setDeveloperKey(GOOGLE_API_KEY)
    builder.build().setVisible(true)
  })
}

/** Drive REST API로 폴더 생성 */
async function createFolder(name: string, parentId: string, accessToken: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error?.message ?? `폴더 생성 실패 (${res.status})`)
  }
  const data = await res.json()
  return data.id as string
}

/**
 * 작업 폴더 구조 생성:
 * [상위폴더] / [YYYYMMDD 업체명] / 작업 전, 작업 후
 */
export async function createWorkFolderStructure(
  parentFolderId: string,
  businessName: string,
  constructionDate: string, // YYYY-MM-DD
  accessToken: string
): Promise<{ folderId: string; folderUrl: string; folderName: string }> {
  const dateStr = constructionDate.replace(/-/g, '')
  const folderName = `${dateStr} ${businessName}`

  // 상위 폴더
  const mainId = await createFolder(folderName, parentFolderId, accessToken)

  // 하위 폴더 2개 병렬 생성
  await Promise.all([
    createFolder('작업 전', mainId, accessToken),
    createFolder('작업 후', mainId, accessToken),
  ])

  return {
    folderId: mainId,
    folderUrl: `https://drive.google.com/drive/folders/${mainId}`,
    folderName,
  }
}

// ─── 쿠키 유틸 ────────────────────────────────────────────────
const COOKIE_KEY = 'bbk_drive_folder'

export function getSavedDriveFolder(): DriveFolder | null {
  if (typeof document === 'undefined') return null
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]+)`))
    return m ? JSON.parse(decodeURIComponent(m[1])) : null
  } catch { return null }
}

export function saveDriveFolderCookie(folder: DriveFolder) {
  const exp = new Date()
  exp.setFullYear(exp.getFullYear() + 1)
  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(JSON.stringify(folder))};expires=${exp.toUTCString()};path=/`
}
