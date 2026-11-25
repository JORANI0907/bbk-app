'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button, Input, Modal } from '@/components/ui'
import { describeDeliveryResult, formatMobile, normalizeMobile } from '@/lib/contract-send'

interface ContractDeliverModalProps {
  open: boolean
  onClose: () => void
  contractId: string
  businessName: string
  contactName: string | null
  /** 계약서·고객 정보에서 가져온 기본값 (모달에서 고칠 수 있다) */
  defaultPhone: string
  defaultEmail: string
  /** 발송 성공 뒤 호출 (화면 새로고침용) */
  onSent?: () => void
}

/**
 * 서명이 모두 끝난 계약서를 고객에게 보내는 모달.
 * 서명 요청 모달과 같은 흐름 — 어디로 보내는지 확인하고, 필요하면 고쳐서 보낸다.
 * 문자에는 PDF 링크, 이메일에는 PDF 파일이 첨부된다.
 */
export default function ContractDeliverModal({
  open, onClose, contractId, businessName, contactName, defaultPhone, defaultEmail, onSent,
}: ContractDeliverModalProps) {
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [isSending, setIsSending] = useState(false)

  // 열릴 때마다 기본값으로 되돌린다 (이전에 고친 값이 남지 않도록)
  useEffect(() => {
    if (!open) return
    const digits = normalizeMobile(defaultPhone)
    setPhone(digits ? formatMobile(digits) : defaultPhone)
    setEmail(defaultEmail)
  }, [open, defaultPhone, defaultEmail])

  const handleSend = async () => {
    setIsSending(true)
    try {
      const res = await fetch(`/api/admin/contracts/${contractId}/deliver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, email }),
      })
      const json = await res.json()
      if (json.success) {
        const msg = describeDeliveryResult(json)
        if (json.email === 'failed') toast(msg, { icon: '⚠️', duration: 6000 })
        else toast.success(msg)
        onClose()
        onSent?.()
      } else {
        toast.error(json.error ?? '발송에 실패했습니다.')
      }
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="계약서 발송"
      description={`${businessName}${contactName ? ` · ${contactName}` : ''}`}
    >
      <div className="space-y-4">
        <Input
          label="휴대폰 번호 (문자)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="010-0000-0000"
          inputMode="tel"
          fullWidth
          hint="이 번호로 계약서 PDF 링크가 문자로 발송됩니다. 계약서에 저장된 연락처는 바뀌지 않습니다."
        />
        <Input
          label="이메일 (선택)"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="비워 두면 문자만 발송"
          fullWidth
          hint="계약서 PDF 파일을 첨부해 보냅니다. 고객 정보에 이메일이 없으면 여기 적은 주소로 채워집니다."
        />
        <p className="text-xs text-text-tertiary bg-surface-sunken rounded-lg p-3 leading-relaxed">
          서명이 모두 끝난 완료본을 보냅니다. 문자 문구는 문자알림관리의 &quot;계약서 완료&quot; 양식을 따르며, 여러 번 보내도 같은 PDF 가 갑니다.
        </p>
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={isSending}>취소</Button>
          <Button className="flex-1" onClick={handleSend} isLoading={isSending} disabled={!normalizeMobile(phone)}>
            {email.trim() ? '문자·이메일 발송' : '문자 발송'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
