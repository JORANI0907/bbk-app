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

/** OAuth2 액세스 토큰 요청 (Sheets + Drive + Gmail 스코프) */
export function requestGoogleTokenWithScopes(): Promise<string> {
  if (!GOOGLE_CLIENT_ID) {
    return Promise.reject(new Error('NEXT_PUBLIC_GOOGLE_CLIENT_ID가 설정되지 않았습니다.'))
  }
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google
    const tokenClient = g.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/gmail.send',
      ].join(' '),
      callback: (resp: { access_token?: string; error?: string }) => {
        if (resp.error) reject(new Error(`Google 인증 실패: ${resp.error}`))
        else resolve(resp.access_token!)
      },
    })
    tokenClient.requestAccessToken()
  })
}

/**
 * 폴더 ID가 바로가기(Shortcut)인 경우 실제 폴더 ID로 resolve
 * 실패하면 Picker가 반환한 원래 값 그대로 사용
 */
export async function resolveFolder(picked: DriveFolder, accessToken: string): Promise<DriveFolder> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${picked.id}?fields=id,name,shortcutDetails&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!res.ok) return picked // 접근 불가면 Picker 결과 그대로 사용
    const data = await res.json()
    if (data.shortcutDetails?.targetId) {
      // 바로가기 → 실제 폴더로 재귀 resolve
      return resolveFolder({ id: data.shortcutDetails.targetId, name: data.name as string }, accessToken)
    }
    return { id: data.id as string, name: data.name as string }
  } catch {
    return picked // 예외 시에도 Picker 결과 그대로
  }
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
      .setEnableDrives(true)

    const builder = new g.picker.PickerBuilder()
      .addView(view)
      .enableFeature(g.picker.Feature.SUPPORT_DRIVES)
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

/** Drive REST API로 폴더 생성 (공유 드라이브 포함) */
async function createFolder(name: string, parentId: string, accessToken: string): Promise<string> {
  const res = await fetch(
    'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true',
    {
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
    }
  )
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

// ─── 재고 사진 폴더 저장 (localStorage 우선, cookie 병행) ────────
const INVENTORY_FOLDER_KEY = 'bbk_inventory_folder'

export function getSavedInventoryFolder(): DriveFolder | null {
  if (typeof window === 'undefined') return null
  try {
    // localStorage 우선 조회
    const ls = localStorage.getItem(INVENTORY_FOLDER_KEY)
    if (ls) return JSON.parse(ls)
    // fallback: 기존 cookie 마이그레이션
    const m = document.cookie.match(new RegExp(`(?:^|; )${INVENTORY_FOLDER_KEY}=([^;]+)`))
    if (m) {
      const val = JSON.parse(decodeURIComponent(m[1]))
      localStorage.setItem(INVENTORY_FOLDER_KEY, JSON.stringify(val))
      return val
    }
  } catch { /* ignore */ }
  return null
}

export function saveInventoryFolderCookie(folder: DriveFolder): void {
  try {
    localStorage.setItem(INVENTORY_FOLDER_KEY, JSON.stringify(folder))
  } catch { /* ignore */ }
  // cookie도 병행 저장 (구버전 호환)
  try {
    const exp = new Date()
    exp.setFullYear(exp.getFullYear() + 1)
    document.cookie = `${INVENTORY_FOLDER_KEY}=${encodeURIComponent(JSON.stringify(folder))};expires=${exp.toUTCString()};path=/;SameSite=Lax`
  } catch { /* ignore */ }
}

/**
 * 업체명(이름 포함)으로 Google Drive 폴더 검색
 * 예: "범빌드코리아" → "20260413 범빌드코리아" 형태의 폴더 검색
 */
export async function searchDriveFoldersByName(
  businessName: string,
  accessToken: string
): Promise<Array<{ id: string; name: string; webViewLink: string }>> {
  const safe = businessName.replace(/'/g, "\\'")
  const q = encodeURIComponent(
    `name contains '${safe}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  )
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,webViewLink)&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=20&orderBy=name desc`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error?.message ?? `Drive 검색 실패 (${res.status})`)
  }
  const data = await res.json()
  return (data.files ?? []) as Array<{ id: string; name: string; webViewLink: string }>
}

// ─── Drive 파일 업로드 (multipart) ────────────────────────────
export async function uploadFileToDrive(
  file: File,
  folderId: string,
  fileName: string,
  accessToken: string
): Promise<{ fileId: string; fileUrl: string }> {
  const metadata = { name: fileName, parents: [folderId] }
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  form.append('file', file)

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    }
  )

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error?.message ?? `업로드 실패 (${res.status})`)
  }

  const data = await res.json()
  return {
    fileId: data.id as string,
    fileUrl: `https://drive.google.com/file/d/${data.id}/view`,
  }
}
