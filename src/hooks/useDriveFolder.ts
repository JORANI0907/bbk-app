'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import {
  type DriveFolder,
  loadGoogleAPIs,
  requestGoogleToken,
  openFolderPicker,
  resolveFolder,
  saveDriveFolderCookie,
  getSavedDriveFolder as getDriveFolderCookie,
  createWorkFolderStructure,
} from '@/lib/googleDrive'

interface UseDriveFolderOptions {
  /** 저장 콜백 — 새 URL 을 부모가 DB PATCH + 로컬 state 갱신에 사용 */
  onSaved: (url: string) => Promise<void> | void
  /** 폴더명에 쓸 업체명 */
  businessName: string
  /**
   * 폴더명에 쓸 시공일자 (YYYY-MM-DD).
   * null 인 경우 폴더 생성이 거부되고 오류 토스트가 뜬다.
   * (과거엔 null 이면 오늘 날짜로 조용히 대체됐지만, 사장님 지시로 제거함 — 2026-08-26)
   */
  dateForName: string | null
}

interface DriveFolderState {
  apisReady: boolean
  savedDefaultParent: DriveFolder | null
  saving: boolean
  /** 기본 부모(cookie) 에 그대로 생성 · 없으면 피커 열기. 위치 변경도 이 함수로 */
  createOrChange: (useSaved: boolean) => Promise<void>
  /** 무조건 피커 열기 (위치 변경 강제) */
  pickParentAndCreate: () => Promise<void>
}

/**
 * Phase 27-AI: Drive 폴더 생성/변경/열기 재사용 훅.
 * ServiceManagementView 의 기존 검증된 로직을 훅으로 뽑아 customer 세부화면 · 회차 아코디언
 * 두 곳에서 동일하게 사용.
 *
 * OAuth token 은 브라우저 user gesture 안에서만 팝업 뜨는 제약 → 모든 create 함수는
 * 이벤트 핸들러(onClick) 안에서 직접 await 되어야 함.
 */
export function useDriveFolder({ onSaved, businessName, dateForName }: UseDriveFolderOptions): DriveFolderState {
  const [apisReady, setApisReady] = useState(false)
  const [savedDefaultParent, setSavedDefaultParent] = useState<DriveFolder | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSavedDefaultParent(getDriveFolderCookie())
    loadGoogleAPIs().then(() => setApisReady(true)).catch(() => {})
  }, [])

  async function createInParent(parentId: string, token: string) {
    // dateForName 은 시공일자(YYYY-MM-DD). null 이면 여기서 createOrChange 의 사전검증에서 이미 걸러짐.
    const result = await createWorkFolderStructure(parentId, businessName, dateForName!, token)
    await onSaved(result.folderUrl)
    toast.success(`"${result.folderName}" 폴더 생성 완료`, { duration: 5000 })
    window.open(result.folderUrl, '_blank')
  }

  async function createOrChange(useSaved: boolean) {
    if (!apisReady) {
      toast.error('Google API 로딩 중입니다. 잠시 후 다시 시도해주세요.')
      return
    }
    if (!businessName?.trim()) {
      toast.error('업체명이 없어 폴더를 만들 수 없습니다.')
      return
    }
    // 시공일자 미지정 시 폴더 생성 거부 (과거엔 오늘 날짜로 조용히 대체되던 버그 fix)
    if (!dateForName) {
      toast.error('시공일자가 설정되지 않아 폴더를 만들 수 없습니다. 먼저 시공일자를 입력해주세요.', { duration: 6000 })
      return
    }
    setSaving(true)
    try {
      if (useSaved && savedDefaultParent) {
        const token = await requestGoogleToken()
        await createInParent(savedDefaultParent.id, token)
      } else {
        // 피커 열기 (위치 지정)
        const token = await requestGoogleToken()
        const picked = await openFolderPicker(token)
        if (!picked) return
        const parent = await resolveFolder(picked, token)
        if (!parent) return
        setSavedDefaultParent(parent)
        saveDriveFolderCookie(parent)
        await createInParent(parent.id, token)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const isTrulyMissing = msg.includes('File not found') && !msg.toLowerCase().includes('permission')
      if (isTrulyMissing) {
        toast.error('Drive 폴더를 찾을 수 없습니다. 위치를 다시 지정해주세요.', { duration: 5000 })
        setSavedDefaultParent(null)
        document.cookie = 'bbk_drive_folder=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/'
      } else {
        toast.error(`Drive 처리 실패: ${msg}`, { duration: 8000 })
      }
    } finally {
      setSaving(false)
    }
  }

  async function pickParentAndCreate() {
    await createOrChange(false)
  }

  return { apisReady, savedDefaultParent, saving, createOrChange, pickParentAndCreate }
}
