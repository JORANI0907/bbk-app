'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import {
  MessageCircle, Clock, Package, Layers, Link, PenLine, ClipboardList,
  FileText, Phone as PhoneIcon, Bot, Bell, Smartphone, MessageSquare,
} from 'lucide-react'

// ─── 타입 ─────────────────────────────────────────────────────────

interface AutomationItem {
  id: string
  name: string
  description: string
  category: string
  active: boolean
  trigger: string
  slackEnabled: boolean
  scenarioId?: number | null
  channelType?: 'alimtalk' | 'sms' | 'both' | 'none'
  templateId?: string
}

interface ActivityItem {
  id: string
  name: string
  description: string
  icon: string
  trigger: string
}

interface AlimtalkTemplate {
  id: string
  templateCode: string
  name: string
  variables: string[]
  trigger: string
  triggerType: 'auto' | 'manual' | 'webhook'
  schedule?: string
}

interface SmsItem {
  id: string
  name: string
  desc: string
  trigger: string
  triggerType: 'auto' | 'manual' | 'webhook'
  schedule?: string
}

type TabKey =
  | 'notifications' | 'service'
  | 'sms' | 'system' | 'contracts'

// ─── 데이터 ───────────────────────────────────────────────────────

const ALIMTALK_TEMPLATES: AlimtalkTemplate[] = [
  // ── 예약/확정 ────────────────────────────────────────────────────
  {
    id: 'confirm',
    templateCode: 'KA01TP260324131935207wzarljIsiyK',
    name: '예약확정 알림',
    variables: ['고객명', '고객연락처', '상호명', '케어유형', '담당자', '주소', '시공일자', '요청시간', '미팅여부', '미팅시간'],
    trigger: '매월 23일 다음달 일정 자동 생성 시 즉시',
    triggerType: 'auto',
    schedule: '매월 23일 09:00 KST',
  },
  {
    id: 'reservation-day-before',
    templateCode: 'KA01TP260324131935294IPmMhH8BWA8',
    name: '예약 1일전 알림',
    variables: ['고객명', '상호명', '케어유형', '담당자', '주소', '시공일자', '요청시간', '미팅여부', '미팅시간'],
    trigger: '내일 시공 + 배정완료 건에 자동 발송 (정기엔드케어 제외)',
    triggerType: 'auto',
    schedule: '매일 06:00 KST',
  },
  {
    id: 'reservation-today',
    templateCode: 'KA01TP2603241319353583492vcrZ9c2',
    name: '예약 당일 알림',
    variables: ['고객명', '상호명', '케어유형', '담당자', '주소', '시공일자', '요청시간', '미팅여부', '미팅시간'],
    trigger: '오늘 시공 + 배정완료 건에 자동 발송',
    triggerType: 'auto',
    schedule: '매일 06:00 KST',
  },
  {
    id: 'regular-visit',
    templateCode: 'KA01TP260324125257699vIDeuYdkbc0',
    name: '정기방문 알림',
    variables: ['고객명', '방문일자', '담당자'],
    trigger: '정기고객 방문 예정 알림 (수동 발송)',
    triggerType: 'manual',
  },
  {
    id: 'reservation-cancel',
    templateCode: 'KA01TP260324125232854lv8CCYK3Ozu',
    name: '예약취소 알림',
    variables: ['고객명', '시공일자'],
    trigger: '예약 취소 처리 시 수동 발송',
    triggerType: 'manual',
  },
  // ── 작업완료 ─────────────────────────────────────────────────────
  {
    id: 'end-care-complete',
    templateCode: 'KA01TP251208071633315G1wZC9a3w4F',
    name: '정기엔드케어 작업완료 알림',
    variables: ['#{고객명}', '#{업체명}', '#{특이사항}', '#{드라이브링크}'],
    trigger: '배정관리 > 작업완료 버튼 클릭 (수동)',
    triggerType: 'manual',
  },
  {
    id: 'work-complete-general',
    templateCode: 'KA01TP260324125200271OOXEk0LPiAS',
    name: '작업완료 알림 (일반)',
    variables: ['고객명', '업체명', '시공일자', '청소비용', '결제방법'],
    trigger: '배정관리 > 작업완료 버튼 클릭 (수동) — 계좌이체 외 결제',
    triggerType: 'manual',
  },
  {
    id: 'work-complete-cash',
    templateCode: 'KA01TP260324125200310YfeiY0REGVv',
    name: '작업완료 알림 (현금결제)',
    variables: ['고객명', '업체명', '시공일자', '청소비용'],
    trigger: '배정관리 > 작업완료 버튼 클릭 (수동) — 결제방법: 현금',
    triggerType: 'manual',
  },
  {
    id: 'work-complete-card-platform',
    templateCode: 'KA01TP260324132220016T20FiBMSKKA',
    name: '작업완료 알림 (카드·플랫폼 결제)',
    variables: ['고객명', '업체명', '시공일자', '청소비용'],
    trigger: '배정관리 > 작업완료 버튼 클릭 (수동) — 결제방법: 카드·플랫폼',
    triggerType: 'manual',
  },
  // ── 결제 ─────────────────────────────────────────────────────────
  {
    id: 'billing',
    templateCode: 'KA01TP260324125257636A2QdT1YNpL5',
    name: '정기결제 알림',
    variables: ['#{고객명}', '#{청소비용}'],
    trigger: '정기엔드케어·정기딥케어(연간) 결제일 도래 후 미결제 시 매일 반복',
    triggerType: 'auto',
    schedule: '매일 14:00 KST',
  },
  {
    id: 'payment-cron',
    templateCode: 'KA01TP260324125232471CIIHJKDOBsf',
    name: '잔금 결제 요청',
    variables: ['고객명', '청소비용'],
    trigger: '작업완료 후 결제완료 전 건 매일 반복 발송 (정기엔드케어 제외)',
    triggerType: 'auto',
    schedule: '매일 06:00 KST',
  },
  {
    id: 'billing-cash',
    templateCode: 'KA01TP251127095540783njh0ig3nyjg',
    name: '결제 요청 (현금)',
    variables: ['고객명', '청소비용'],
    trigger: '작업완료 후 결제 미완료 건 자동 반복 — 결제방법: 현금',
    triggerType: 'auto',
    schedule: '매일 06:00 KST',
  },
  {
    id: 'billing-card-platform',
    templateCode: 'KA01TP251201210650817mczUreAtEjU',
    name: '결제 요청 (카드·플랫폼)',
    variables: ['고객명', '청소비용'],
    trigger: '작업완료 후 결제 미완료 건 자동 반복 — 결제방법: 카드·플랫폼',
    triggerType: 'auto',
    schedule: '매일 06:00 KST',
  },
  {
    id: 'billing-per-case',
    templateCode: 'KA01TP260324125257773XLuybvXeleL',
    name: '건당결제 알림',
    variables: ['고객명', '청소비용'],
    trigger: '정기딥케어 건별 결제 요청 (PENDING — SMS fallback 처리 중)',
    triggerType: 'auto',
    schedule: '매일 14:00 KST',
  },
  {
    id: 'card-payment',
    templateCode: 'KA01TP260324125232674HVfev9PAzUe',
    name: '카드결제 완료 알림',
    variables: ['고객명', '사업자등록번호', '페이백계좌번호'],
    trigger: '카드 결제 승인 즉시 (결제 PG 웹훅)',
    triggerType: 'webhook',
  },
  {
    id: 'annual-renewal',
    templateCode: 'KA01TP260324125257737g0vuFScqrCv',
    name: '연간계약 갱신 안내',
    variables: ['고객명', '만료일', '잔여일'],
    trigger: '정기딥케어(연간) 계약만료 30일 전부터 매일 반복',
    triggerType: 'auto',
    schedule: '매일 14:00 KST',
  },
  {
    id: 'deposit-complete',
    templateCode: 'KA01TP260220102437819kp8ysvD4XqB',
    name: '예약금 입금완료 알림',
    variables: ['고객명', '입금금액'],
    trigger: '예약금 입금 확인 후 수동 발송',
    triggerType: 'manual',
  },
  {
    id: 'deposit-refund',
    templateCode: 'KA01TP260324125232819wDhAV1kuhAF',
    name: '예약금 환급완료 알림',
    variables: ['고객명', '환급금액'],
    trigger: '예약금 환급 처리 시 수동 발송',
    triggerType: 'manual',
  },
  {
    id: 'invoice-complete',
    templateCode: 'KA01TP260324125232783yjmHI9u6j6j',
    name: '계산서 발행완료 알림',
    variables: ['고객명', '발행금액', '발행일자'],
    trigger: '세금계산서 발행 완료 시 수동 발송',
    triggerType: 'manual',
  },
  // ── 견적/신청 ─────────────────────────────────────────────────────
  {
    id: 'quote-send',
    templateCode: 'KA01TP260219115331451o0aakYaJSp8',
    name: '견적서 발송 알림',
    variables: ['고객명', '견적금액', '견적링크'],
    trigger: '견적서 관리 > "견적서 발송" 버튼 클릭 (수동)',
    triggerType: 'manual',
  },
  {
    id: 'application-complete',
    templateCode: 'KA01TP260225105100279pvfbwyZDT39',
    name: '신청서 작성완료 알림',
    variables: ['고객명', '업체명'],
    trigger: '고객 신청서 작성 완료 시 자동 발송',
    triggerType: 'auto',
  },
  {
    id: 'quote-received',
    templateCode: 'KA01TP260514153343828rQpIWkeH7pg',
    name: '견적 신청 접수 알림',
    variables: ['고객명', '업체명'],
    trigger: '온라인 견적 신청 접수 시 자동 발송',
    triggerType: 'auto',
  },
  {
    id: 'site-estimate',
    templateCode: 'KA01TP260324125232920u1LmrtqCY0P',
    name: '방문견적 알림',
    variables: ['고객명', '방문일자', '담당자'],
    trigger: '방문 견적 일정 확정 시 수동 발송',
    triggerType: 'manual',
  },
  {
    id: 'as-visit',
    templateCode: 'KA01TP260324125232887FY113tVp5zb',
    name: 'A/S 방문 알림',
    variables: ['고객명', '방문일자', '담당자'],
    trigger: 'A/S 방문 일정 확정 시 수동 발송',
    triggerType: 'manual',
  },
  // ── 계정 ──────────────────────────────────────────────────────────
  {
    id: 'account-info',
    templateCode: 'KA01TP260404141110684azipFQYSyxX',
    name: '계정 안내 알림 (일반)',
    variables: ['고객명', '아이디', '비밀번호'],
    trigger: '관리자 수동 계정 안내 발송 → /api/admin/notify',
    triggerType: 'manual',
  },
  {
    id: 'account-info-regular',
    templateCode: 'KA01TP260324125257807O2QPegF6wmS',
    name: '계정 안내 알림 (정기고객)',
    variables: ['고객명', '아이디', '비밀번호'],
    trigger: '정기고객 계정 생성 또는 안내 시 자동/수동 발송',
    triggerType: 'manual',
  },
  {
    id: 'member-account',
    templateCode: 'KA01TP260515182858932rdNwPSJALBo',
    name: '직원 계정 발송',
    variables: ['#{고객명}', '#{아이디}', '#{비밀번호}'],
    trigger: '관리자 > 계정관리 > "계정 발송" 버튼 클릭 (수동)',
    triggerType: 'manual',
  },
]

const SMS_ITEMS: SmsItem[] = [
  {
    id: 'sms-work-complete',
    name: '1회성·정기딥케어 작업완료 알림',
    desc: '배정관리에서 작업완료 처리 후 1시간 뒤 자동 발송됩니다. (정기엔드케어 제외)',
    trigger: '배정관리 완료 처리 후 1시간 뒤 자동',
    triggerType: 'manual',
  },
  {
    id: 'sms-subscription-promo',
    name: '1회성케어 구독권유 광고문자',
    desc: '카드결제 완료 후 구독 전환 안내 광고 문자를 1회 발송합니다.',
    trigger: '카드결제 완료 즉시 자동 (웹훅)',
    triggerType: 'webhook',
  },
  {
    id: 'sms-contract-sign',
    name: '계약서 서명 요청 링크',
    desc: '온라인 계약서 "서명 요청 발송" 클릭 시 고객에게 서명 링크를 전송합니다. (유효기간 7일)',
    trigger: '관리자 수동 발송 (계약서 관리)',
    triggerType: 'manual',
  },
  {
    id: 'sms-otp',
    name: 'SMS OTP 인증번호',
    desc: '로그인 및 계약서 서명 시 6자리 인증번호를 발송합니다.',
    trigger: '로그인 또는 계약서 서명 요청 시',
    triggerType: 'manual',
  },
]

const INITIAL_ITEMS: AutomationItem[] = [
  // ── 고객응대 ────────────────────────────────────────────────
  {
    id: 'missed-call',
    name: '부재중 전화 자동 명함 발송',
    description: '부재중 전화 감지 시 명함 문자를 자동 발송합니다.',
    category: '고객응대',
    active: true,
    trigger: 'Webhook (부재중 전화 감지)',
    slackEnabled: true,
    channelType: 'sms',
  },
  // ── 예약알림 ────────────────────────────────────────────────
  {
    id: 'schedule-notify-day-before',
    name: '예약 1일전 알림 자동 발송',
    description: '내일 시공 예정 + 배정완료 건에 카카오 알림톡을 자동 발송합니다. (정기엔드케어 제외)',
    category: '예약알림',
    active: true,
    trigger: '매일 06:00 KST → /api/cron/reservation-reminders',
    slackEnabled: true,
    channelType: 'alimtalk',
    templateId: 'KA01TP260324131935294IPmMhH8BWA8',
  },
  {
    id: 'schedule-notify-today',
    name: '예약 당일 알림 자동 발송',
    description: '오늘 시공 예정 + 배정완료 건에 카카오 알림톡을 자동 발송합니다.',
    category: '예약알림',
    active: true,
    trigger: '매일 06:00 KST → /api/cron/reservation-reminders',
    slackEnabled: true,
    channelType: 'alimtalk',
    templateId: 'KA01TP2603241319353583492vcrZ9c2',
  },
  // ── 예약확정 ────────────────────────────────────────────────
  {
    id: 'cron-auto-schedule',
    name: '정기딥케어·엔드케어 다음달 일정 자동 생성 + 예약확정 알림톡',
    description: '매월 23일 활성 정기 고객 전체의 다음달 방문 일정을 자동 생성하고, 예약확정 카카오 알림톡을 발송합니다.',
    category: '예약확정',
    active: true,
    trigger: '매월 23일 09:00 KST (Make 시나리오 #8990139)',
    slackEnabled: true,
    channelType: 'alimtalk',
    templateId: 'KA01TP260324131935207wzarljIsiyK',
  },
  {
    id: 'service-app-bulk-create',
    name: '정기딥케어·엔드케어 월간 일정 수동 생성',
    description: '관리자가 고객 선택 후 "다음달 일정 생성" 버튼 클릭 시 방문 일정을 일괄 생성합니다.',
    category: '예약확정',
    active: true,
    trigger: '관리자 수동 실행 → /api/admin/customers/generate-schedules',
    slackEnabled: false,
    channelType: 'none',
  },
  // ── 작업완료 ────────────────────────────────────────────────
  {
    id: 'work-complete-notify-endcare',
    name: '정기엔드케어 작업완료 알림',
    description: '배정관리에서 작업완료 처리 시 카카오 알림톡을 발송합니다. 실패 시 SMS fallback.',
    category: '작업완료',
    active: true,
    trigger: '배정관리 > 작업완료 버튼 클릭 (수동)',
    slackEnabled: true,
    channelType: 'alimtalk',
    templateId: 'KA01TP251208071633315G1wZC9a3w4F',
  },
  {
    id: 'work-complete-notify-others',
    name: '1회성·정기딥케어 작업완료 알림',
    description: '배정관리에서 작업완료 처리 시 SMS를 발송합니다. (완료 후 1시간 예약 발송)',
    category: '작업완료',
    active: true,
    trigger: '배정관리 > 작업완료 버튼 클릭 후 1시간 뒤 자동 발송',
    slackEnabled: true,
    channelType: 'sms',
  },
  // ── 결제알림 ────────────────────────────────────────────────
  {
    id: 'payment-notify-end-care',
    name: '정기엔드케어 결제알림',
    description: '매월 결제일 도래 후 이번 달 미결제 고객에게 카카오 알림톡을 발송합니다. 결제 완료될 때까지 매일 반복.',
    category: '결제알림',
    active: true,
    trigger: '매일 14:00 KST → /api/webhooks/payment-notify (type: afternoon)',
    slackEnabled: true,
    scenarioId: 9132732,
    channelType: 'alimtalk',
    templateId: 'KA01TP260324125257636A2QdT1YNpL5',
  },
  {
    id: 'payment-notify-annual-billing',
    name: '정기딥케어(연간) 결제알림',
    description: '연간 결제 예정일이 도래한 미결제 건에 카카오 알림톡을 발송합니다. 결제 완료될 때까지 매일 반복.',
    category: '결제알림',
    active: true,
    trigger: '매일 14:00 KST → /api/webhooks/payment-notify (type: afternoon)',
    slackEnabled: true,
    scenarioId: 9132732,
    channelType: 'alimtalk',
    templateId: 'KA01TP260324125257636A2QdT1YNpL5',
  },
  {
    id: 'payment-notify-oneshot',
    name: '1회성·정기딥케어(월간) 결제요청',
    description: '작업완료 후 결제완료 전 건에 매일 카카오 알림톡을 발송합니다. 실패 시 SMS fallback.',
    category: '결제알림',
    active: true,
    trigger: '매일 06:00 KST → /api/webhooks/payment-notify (type: morning)',
    slackEnabled: true,
    channelType: 'alimtalk',
    templateId: 'KA01TP260324125257636A2QdT1YNpL5',
  },
  {
    id: 'payment-notify-yearly',
    name: '정기딥케어(연간) 계약 만료 알림',
    description: '계약 만료 30일 전부터 매일 카카오 알림톡으로 연장 안내를 발송합니다. 실패 시 SMS fallback.',
    category: '결제알림',
    active: true,
    trigger: '매일 14:00 KST → /api/webhooks/payment-notify (type: afternoon)',
    slackEnabled: true,
    scenarioId: 9132732,
    channelType: 'alimtalk',
    templateId: 'KA01TP260324125257737g0vuFScqrCv',
  },
  {
    id: 'payment-card-webhook',
    name: '카드결제 완료 알림',
    description: '카드 결제 승인 즉시 카카오 알림톡을 발송합니다.',
    category: '결제알림',
    active: true,
    trigger: '카드 결제 승인 즉시 (결제 PG 웹훅) → /api/webhooks/payment-card',
    slackEnabled: false,
    channelType: 'alimtalk',
    templateId: 'KA01TP260324125232674HVfev9PAzUe',
  },
  // ── 서비스관리 ──────────────────────────────────────────────
  {
    id: 'portal-account-create',
    name: '고객 포털 계정 자동 생성',
    description: '고객 등록 시 연락처가 있으면 포털 계정을 자동 생성합니다.',
    category: '서비스관리',
    active: true,
    trigger: '고객 등록 시 즉시',
    slackEnabled: false,
    channelType: 'none',
  },
  {
    id: 'service-schedules-sync',
    name: 'service_schedules 자동 동기화',
    description: '서비스 신청서에서 담당자 또는 시공일자 변경 시 service_schedules 테이블에 자동 반영합니다.',
    category: '서비스관리',
    active: true,
    trigger: '신청서 수정 시 즉시',
    slackEnabled: false,
    channelType: 'none',
  },
  {
    id: 'invoice-weekly',
    name: '세금계산서 자동화',
    description: '매주 토요일 해당 주 완료 건 기준으로 세금계산서 발행 처리를 자동화합니다.',
    category: '서비스관리',
    active: false,
    trigger: '매주 토요일 (Make 시나리오)',
    slackEnabled: false,
    channelType: 'none',
  },
  {
    id: 'monthly-report',
    name: '월간 보고서 자동 생성',
    description: '매월 1일 전월 데이터를 집계하여 관리자에게 보고서를 발송합니다.',
    category: '서비스관리',
    active: true,
    trigger: '매월 1일 00:00 KST',
    slackEnabled: true,
    channelType: 'none',
  },
  {
    id: 'inventory-alert',
    name: '재고 부족 자동 알림',
    description: '재고 수량이 최소 기준 이하로 떨어지면 Slack으로 부족 알림을 발송합니다.',
    category: '서비스관리',
    active: true,
    trigger: '재고 입출고 처리 시 자동 감지',
    slackEnabled: true,
    channelType: 'none',
  },
]

const ACTIVITY_ITEMS: ActivityItem[] = [
  { id: 's1', name: '카카오 알림톡 / SMS 발송', description: '수동·자동 발송 모든 알림을 건마다 Slack으로 실시간 보고합니다.', icon: 'message', trigger: '알림 발송 시 즉시' },
  { id: 's2', name: '직원 출퇴근 기록', description: '직원이 출근 또는 퇴근 기록을 남길 때마다 Slack으로 이름·시간을 보고합니다.', icon: 'clock', trigger: '출퇴근 기록 시 즉시' },
  { id: 's3', name: '재고 입출고', description: '재고 입고·수령·반납·수량조정 처리 시 품목명, 수량, 처리자를 Slack으로 보고합니다.', icon: 'package', trigger: '입출고 처리 시 즉시' },
  { id: 's4', name: '재고 품목 추가·수정·삭제', description: '관리자가 재고 품목을 추가·수정·삭제할 때마다 Slack으로 변경 내역을 보고합니다.', icon: 'layers', trigger: '품목 변경 시 즉시' },
  { id: 's5', name: '새 요청 등록', description: '직원 또는 관리자가 새 요청을 등록할 때마다 Slack으로 요청자, 카테고리, 내용을 보고합니다.', icon: 'clipboard', trigger: '요청 등록 시 즉시' },
  { id: 's6', name: '요청 처리·완료', description: '관리자가 요청을 처리(완료/반려)할 때마다 Slack으로 처리 결과를 보고합니다.', icon: 'clipboard', trigger: '요청 처리 시 즉시' },
]

const ACTIVITY_ICON_MAP: Record<string, React.ReactNode> = {
  message: <MessageCircle size={14} />, clock: <Clock size={14} />,
  package: <Package size={14} />, layers: <Layers size={14} />, clipboard: <ClipboardList size={14} />,
}

// ─── 헬퍼 컴포넌트 ────────────────────────────────────────────────

function ChannelBadge({ type }: { type?: string }) {
  if (!type || type === 'none') return null
  if (type === 'alimtalk') return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 flex items-center gap-1"><MessageSquare size={10} /> 알림톡</span>
  if (type === 'sms') return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 flex items-center gap-1"><Smartphone size={10} /> SMS</span>
  if (type === 'both') return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 flex items-center gap-1"><MessageSquare size={10} /> 알림톡+SMS</span>
  return null
}

function TriggerTypeBadge({ type }: { type: 'auto' | 'manual' | 'webhook' }) {
  const map = {
    auto:    'bg-blue-100 text-blue-700 자동',
    manual:  'bg-orange-100 text-orange-700 반자동',
    webhook: 'bg-purple-100 text-purple-700 자동(웹훅)',
  }
  const parts = map[type].split(' ')
  const cls = parts.slice(0, -1).join(' ')
  const label = parts[parts.length - 1]
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
}

function AutomationCard({ item, onToggle }: { item: AutomationItem; onToggle: (id: string) => void }) {
  return (
    <div className={`bg-surface rounded-xl border p-4 transition-all ${item.active ? 'border-border-subtle shadow-soft' : 'border-border-subtle opacity-55'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${item.active ? 'bg-state-success-bg text-state-success' : 'bg-surface-sunken text-text-secondary'}`}>
              {item.active ? '● 활성' : '○ 비활성'}
            </span>
            <ChannelBadge type={item.channelType} />
            {item.slackEnabled && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">Slack</span>}
          </div>
          <h3 className="text-sm font-bold text-text-primary">{item.name}</h3>
          <p className="text-xs text-text-secondary mt-1 leading-relaxed">{item.description}</p>
          {item.templateId && (
            <div className="mt-1.5 flex items-center gap-1">
              <span className="text-[10px] text-text-tertiary">템플릿:</span>
              <code className="text-[10px] text-yellow-700 bg-yellow-50 px-1.5 py-0.5 rounded font-mono">{item.templateId}</code>
            </div>
          )}
          <div className="flex items-center gap-1 mt-1.5">
            <span className="text-[11px] text-text-tertiary">트리거:</span>
            <span className="text-[11px] text-text-secondary font-medium">{item.trigger}</span>
          </div>
        </div>
        <button
          onClick={() => onToggle(item.id)}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 mt-1 ${item.active ? 'bg-brand-600' : 'bg-border'}`}
          aria-label={item.active ? '비활성화' : '활성화'}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${item.active ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>
    </div>
  )
}

// ─── 탭 설정 ──────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'notifications', label: '알림',        icon: <Bell size={12} /> },
  { key: 'sms',           label: 'SMS',         icon: <Smartphone size={12} /> },
  { key: 'service',       label: '서비스관리',  icon: <Package size={12} /> },
  { key: 'system',        label: '시스템 알림', icon: <Layers size={12} /> },
  { key: 'contracts',     label: '계약서',      icon: <PenLine size={12} /> },
]

// ─── 메인 컴포넌트 ────────────────────────────────────────────────

export default function AutomationPage() {
  const router = useRouter()
  const [items, setItems] = useState<AutomationItem[]>(INITIAL_ITEMS)
  const [showAddModal, setShowAddModal] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('notifications')


  const handleToggle = async (id: string) => {
    const item = items.find(i => i.id === id)
    if (!item) return
    const newActive = !item.active
    setItems(prev => prev.map(i => i.id === id ? { ...i, active: newActive } : i))
    try {
      await fetch('/api/admin/make-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId: item.scenarioId ?? null, active: newActive }),
      })
      toast.success(newActive ? `${item.name} 활성화됨` : `${item.name} 비활성화됨`)
    } catch {
      setItems(prev => prev.map(i => i.id === id ? { ...i, active: item.active } : i))
      toast.error('상태 변경 실패')
    }
  }

  const byCategory = (cats: string[]) => items.filter(i => cats.includes(i.category))

  const totalAlimtalk = items.filter(i => i.active && (i.channelType === 'alimtalk' || i.channelType === 'both')).length
  const totalSms = items.filter(i => i.active && (i.channelType === 'sms' || i.channelType === 'both')).length

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
        <div>
          <h1 className="text-lg font-bold text-text-primary">자동화관리</h1>
          <p className="text-xs text-text-tertiary mt-0.5">Make.com 시나리오 · 알림톡 · SMS · Slack</p>
        </div>
        <div className="flex gap-2">
          <a href={`https://www.make.com/en/organization/2567117/scenarios`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 border border-border text-text-secondary text-sm font-medium rounded-xl hover:bg-surface-sunken transition-colors">
            <Link size={14} /> Make.com
          </a>
          <Button onClick={() => setShowAddModal(true)}><span className="text-base leading-none">+</span> 새 자동화</Button>
        </div>
      </div>

      {/* 통계 배너 */}
      <div className="px-4 pb-3 shrink-0">
        <div className="bg-brand-50 rounded-xl p-3 grid grid-cols-4 gap-3">
          <div><p className="text-[11px] text-brand-600 font-medium">전체</p><p className="text-xl font-bold text-brand-700">{items.length}개</p></div>
          <div><p className="text-[11px] text-state-success font-medium">활성</p><p className="text-xl font-bold text-state-success">{items.filter(i => i.active).length}개</p></div>
          <div><p className="text-[11px] text-yellow-600 font-medium">알림톡</p><p className="text-xl font-bold text-yellow-700">{totalAlimtalk}개</p></div>
          <div><p className="text-[11px] text-blue-600 font-medium">SMS</p><p className="text-xl font-bold text-blue-700">{totalSms}개</p></div>
        </div>
      </div>

      {/* 탭 (1줄 7칸) */}
      <div className="px-4 pb-2 shrink-0">
        <div className="grid grid-cols-5 gap-1 bg-surface-sunken rounded-xl p-1">
          {TABS.map(({ key, label, icon }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`py-1.5 text-[11px] font-semibold rounded-lg transition-colors flex flex-col items-center justify-center gap-0.5 ${activeTab === key ? 'bg-surface text-text-primary shadow-flat' : 'text-text-secondary hover:text-text-primary'}`}>
              {icon}<span className="leading-tight">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">

        {/* ── 알림 (예약 + 작업완료 + 결제 통합) ── */}
        {activeTab === 'notifications' && (
          <div className="space-y-5">
            {[
              { label: '예약 알림', cats: ['예약알림', '예약확정'] },
              { label: '작업완료 알림', cats: ['작업완료'] },
              { label: '결제 알림', cats: ['결제알림'] },
            ].map(({ label, cats }) => {
              const catItems = byCategory(cats)
              if (!catItems.length) return null
              return (
                <div key={label}>
                  <p className="text-[11px] font-bold text-text-tertiary mb-2 uppercase tracking-wide">{label}</p>
                  <div className="space-y-2">{catItems.map(item => <AutomationCard key={item.id} item={item} onToggle={handleToggle} />)}</div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── 서비스관리 ── */}
        {activeTab === 'service' && (
          <div className="space-y-2">
            <p className="text-xs text-text-tertiary pb-1">포털 계정 생성·일정 동기화·보고서·재고</p>
            {byCategory(['서비스관리']).map(item => <AutomationCard key={item.id} item={item} onToggle={handleToggle} />)}
          </div>
        )}

        {/* ── SMS ── */}
        {activeTab === 'sms' && (
          <div className="space-y-5">
            {/* 고객응대 SMS */}
            <div>
              <p className="text-[11px] font-bold text-text-tertiary mb-2 uppercase tracking-wide">고객응대</p>
              <div className="space-y-2">
                {byCategory(['고객응대']).map(item => <AutomationCard key={item.id} item={item} onToggle={handleToggle} />)}
              </div>
            </div>
            {/* 일반 SMS 항목 */}
            <div>
              <p className="text-[11px] font-bold text-text-tertiary mb-2 uppercase tracking-wide">발송 항목</p>
              <div className="space-y-2">
                {SMS_ITEMS.map(item => (
                  <div key={item.id} className="bg-surface rounded-xl border border-border-subtle shadow-soft p-4">
                    <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-state-success-bg text-state-success">● 활성</span>
                      <TriggerTypeBadge type={item.triggerType} />
                      {item.schedule && <span className="text-[11px] text-text-tertiary">{item.schedule}</span>}
                    </div>
                    <h3 className="text-sm font-bold text-text-primary mb-1">{item.name}</h3>
                    <p className="text-xs text-text-secondary leading-relaxed mb-1.5">{item.desc}</p>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-text-tertiary">트리거:</span>
                      <span className="text-[11px] text-text-secondary font-medium">{item.trigger}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── 시스템 알림 ── */}
        {activeTab === 'system' && (
          <div className="space-y-3">
            <div className="bg-violet-50 border border-violet-100 rounded-xl p-3">
              <p className="text-xs font-bold text-violet-800">앱 모든 활동 → Slack 실시간 보고</p>
              <p className="text-[11px] text-violet-700 mt-0.5">SLACK_WEBHOOK_URL 환경변수가 설정되어 있으면 즉시 활성화</p>
            </div>
            {ACTIVITY_ITEMS.map(item => (
              <div key={item.id} className="bg-surface rounded-xl border border-border-subtle shadow-soft p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">{ACTIVITY_ICON_MAP[item.icon] ?? null}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-state-success-bg text-state-success">● 활성</span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">Slack 보고</span>
                    </div>
                    <h3 className="text-sm font-bold text-text-primary">{item.name}</h3>
                    <p className="text-xs text-text-secondary mt-1 leading-relaxed">{item.description}</p>
                    <p className="text-[11px] text-text-tertiary mt-1">발송 시점: {item.trigger}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── 계약서 ── */}
        {activeTab === 'contracts' && (
          <div className="space-y-4">
            <div className="bg-brand-50 border border-brand-100 rounded-xl p-4">
              <p className="text-sm font-semibold text-brand-800 mb-1">온라인 계약서 서명 — SMS OTP 방식</p>
              <p className="text-xs text-brand-600 leading-relaxed">외부 플랫폼 없이 앱 내에서 계약서를 발송하고, 고객이 SMS 본인인증으로 서명합니다.</p>
            </div>
            <div className="bg-surface border border-border-subtle rounded-xl p-4">
              <p className="text-xs font-bold text-text-primary mb-3">전체 흐름</p>
              <div className="space-y-2">
                {[
                  { step: '1', color: 'bg-brand-600',   label: '관리자', text: '계약서 작성 — 고객 선택 시 정보 자동 채움' },
                  { step: '2', color: 'bg-sky-500',     label: '관리자', text: '서명 요청 발송 — 고객 전화번호로 SMS 링크 전송' },
                  { step: '3', color: 'bg-emerald-500', label: '고객',   text: '링크 접속 → 계약서 확인 → 조항 체크박스 동의' },
                  { step: '4', color: 'bg-violet-500',  label: '고객',   text: 'OTP 인증 — 휴대폰 번호 입력 → 인증번호 수신 → 입력' },
                  { step: '5', color: 'bg-orange-500',  label: '관리자', text: 'Slack 알림 수신 → 최종 확인 클릭 → 계약 완료' },
                ].map(({ step, color, label, text }) => (
                  <div key={step} className="flex items-start gap-3">
                    <div className={`w-6 h-6 rounded-full ${color} text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5`}>{step}</div>
                    <div><span className="text-[10px] font-bold text-text-tertiary uppercase mr-1.5">{label}</span><span className="text-xs text-text-primary">{text}</span></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-surface border border-border-subtle rounded-xl p-4">
              <p className="text-xs font-bold text-text-primary mb-3">계약서 상태 안내</p>
              <div className="space-y-2">
                {[
                  { status: '작성 중',        color: 'bg-surface-sunken text-text-secondary',   desc: '서명 요청 전' },
                  { status: '서명 대기',      color: 'bg-sky-100 text-sky-700',                 desc: 'SMS 발송 완료, 고객 서명 대기 중' },
                  { status: '고객 서명 완료', color: 'bg-amber-100 text-amber-700',             desc: 'OTP 인증 완료, 관리자 최종 확인 필요' },
                  { status: '계약 완료',      color: 'bg-state-success-bg text-state-success',  desc: '관리자 최종 확인 완료' },
                ].map(({ status, color, desc }) => (
                  <div key={status} className="flex items-center gap-3">
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${color}`}>{status}</span>
                    <span className="text-[11px] text-text-secondary">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-surface border border-border-subtle rounded-xl p-4">
              <p className="text-xs font-bold text-text-primary mb-3">관리자 사용법</p>
              <div className="space-y-3">
                {[
                  { icon: <ClipboardList size={14} />, title: '1. 계약서 작성', desc: '사이드바 → 영업관리 → 온라인 계약서 → "새 계약서 작성"\n고객 선택 시 정보가 자동 채워집니다.' },
                  { icon: <MessageSquare size={14} />, title: '2. 서명 요청 발송', desc: '"서명 요청 발송" 버튼 클릭 → 고객 전화번호로 SMS 링크 전송 (유효기간 7일)' },
                  { icon: <PenLine size={14} />,       title: '3. 최종 확인', desc: '고객 서명 완료 시 Slack 알림 수신 → "최종 확인 완료" 클릭 → 계약 성립' },
                ].map(({ icon, title, desc }) => (
                  <div key={title} className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">{icon}</div>
                    <div><p className="text-xs font-bold text-text-primary mb-0.5">{title}</p><p className="text-[11px] text-text-secondary leading-relaxed whitespace-pre-line">{desc}</p></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-surface border border-border-subtle rounded-xl p-4">
              <p className="text-xs font-bold text-text-primary mb-3">고객 서명 방법</p>
              <div className="space-y-3">
                {[
                  { icon: <Link size={14} />,      title: 'SMS 링크 클릭',   desc: '로그인 없이 바로 계약서 화면이 열립니다.' },
                  { icon: <FileText size={14} />,  title: '계약서 확인',     desc: '전체 스크롤 후 체크박스 3개를 모두 체크해야 "서명하기" 버튼이 활성화됩니다.' },
                  { icon: <PhoneIcon size={14} />, title: 'SMS OTP 인증',   desc: '본인 휴대폰 번호 입력 → 6자리 인증번호 입력 → 서명 완료. 타임스탬프·IP 자동 기록.' },
                ].map(({ icon, title, desc }) => (
                  <div key={title} className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">{icon}</div>
                    <div><p className="text-xs font-bold text-text-primary mb-0.5">{title}</p><p className="text-[11px] text-text-secondary leading-relaxed">{desc}</p></div>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={() => router.push('/admin/contracts')}
              className="w-full flex items-center justify-between px-4 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl transition-colors">
              <div className="flex items-center gap-2"><PenLine size={14} /><span className="text-sm font-semibold">계약서 관리 바로가기</span></div>
              <span className="text-sm opacity-80">→</span>
            </button>
          </div>
        )}
      </div>

      {/* 새 자동화 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-sm shadow-modal p-6 text-center">
            <div className="flex justify-center mb-3"><Bot size={40} /></div>
            <h2 className="text-base font-bold text-text-primary mb-2">새 자동화 추가</h2>
            <p className="text-sm text-text-secondary leading-relaxed mb-5">
              새로운 자동화 시나리오는 <strong className="text-brand-600">Make.com</strong>에서 직접 설정합니다.
            </p>
            <div className="space-y-2">
              <a href="https://www.make.com/en/organization/2567117/scenarios" target="_blank" rel="noopener noreferrer"
                className="block w-full py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors">Make.com 열기</a>
              <Button variant="secondary" onClick={() => setShowAddModal(false)} className="w-full py-2.5">닫기</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
