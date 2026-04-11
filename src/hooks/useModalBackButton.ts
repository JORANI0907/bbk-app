import { useEffect } from 'react'

/**
 * 모달/드로어가 열렸을 때 기기 뒤로가기 버튼으로 닫을 수 있게 해주는 훅
 * history.pushState로 엔트리를 추가하고, popstate 이벤트 발생 시 onClose 호출
 */
export function useModalBackButton(isOpen: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!isOpen) return

    history.pushState({ modal: true }, '')

    const handlePopState = () => {
      onClose()
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [isOpen, onClose])
}
