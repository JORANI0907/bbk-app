import { KbEscrowBadge } from '@/components/KbEscrowBadge'

export const metadata = {
  title: '회사 정보 | BBK 공간케어',
}

interface InfoRow {
  label: string
  value: string
}

const businessInfo: InfoRow[] = [
  { label: '상호명',              value: '범빌드코리아 주식회사' },
  { label: '브랜드',              value: 'BBK 공간케어' },
  { label: '대표이사',            value: '조동환' },
  { label: '법인 사업자등록번호', value: '398-81-04260' },
  { label: '통신판매업 신고번호', value: '제 2026-성남중원-0489호' },
  { label: '사업장 주소',         value: '경기도 성남시 중원구 둔촌대로268번길 22, 2층 201호' },
  { label: '대표전화',            value: '031-759-4877' },
  { label: '담당자 직통',         value: '010-5434-4877' },
  { label: '이메일',              value: 'sunrise@bbkorea.co.kr' },
  { label: '운영시간',            value: '평일·토요일 09:00 – 18:00 (일요일·공휴일 휴무)' },
]

const serviceInfo: InfoRow[] = [
  { label: '주요 서비스', value: '상업 공간 청소 · 정기 딥·엔드 케어 · 1회성 케어' },
  { label: '서비스 지역', value: '성남시 중심 서울 수도권 전역' },
  { label: '결제 대행',   value: '포트원(주) · KG이니시스 (스탠다드)' },
  { label: '구매안전서비스', value: 'KB국민은행 에스크로 (가입 판매자)' },
  { label: '호스팅',      value: 'Vercel Inc.' },
]

export default function CompanyPage() {
  return (
    <div className="space-y-4">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-black text-white leading-tight">회사 정보</h1>
        <p className="text-white/50 text-xs mt-2">범빌드코리아 주식회사 · BBK 공간케어</p>
      </div>

      {/* 사업자 정보 */}
      <div
        className="rounded-2xl border border-white/15 p-5"
        style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)' }}
      >
        <h2 className="text-white font-bold text-sm mb-4 flex items-center gap-2">
          <span className="w-1 h-4 bg-sky-300 rounded-full" />사업자 정보
        </h2>
        <dl className="space-y-2.5">
          {businessInfo.map((row) => (
            <div key={row.label} className="flex flex-col sm:flex-row sm:gap-3">
              <dt className="text-white/50 text-xs sm:min-w-[140px] sm:flex-shrink-0">{row.label}</dt>
              <dd className="text-white/85 text-sm">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* 서비스 개요 */}
      <div
        className="rounded-2xl border border-white/15 p-5"
        style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)' }}
      >
        <h2 className="text-white font-bold text-sm mb-4 flex items-center gap-2">
          <span className="w-1 h-4 bg-sky-300 rounded-full" />서비스 개요
        </h2>
        <dl className="space-y-2.5">
          {serviceInfo.map((row) => (
            <div key={row.label} className="flex flex-col sm:flex-row sm:gap-3">
              <dt className="text-white/50 text-xs sm:min-w-[140px] sm:flex-shrink-0">{row.label}</dt>
              <dd className="text-white/85 text-sm">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* KB에스크로 뱃지 + 안내 */}
      <div
        className="rounded-2xl border border-white/10 p-4"
        style={{ background: 'rgba(255,255,255,0.05)' }}
      >
        <p className="text-white/60 text-xs mb-3 leading-relaxed">
          당사는 소비자 보호를 위해 KB국민은행 에스크로 판매자 인증을 완료한 상태입니다.
          아래 인증마크 클릭 시 KB에스크로 판매자 검증 페이지가 열립니다.
        </p>
        <KbEscrowBadge theme="dark" />
      </div>

      {/* 관련 링크 */}
      <div className="text-center pt-2">
        <p className="text-white/40 text-xs">
          <a href="/terms"   className="hover:text-white/80 mx-2 underline">이용약관</a>·
          <a href="/privacy" className="hover:text-white/80 mx-2 underline">개인정보처리방침</a>·
          <a href="/refund"  className="hover:text-white/80 mx-2 underline">환불 규정</a>·
          <a href="/guide"   className="hover:text-white/80 mx-2 underline">서비스 안내</a>
        </p>
      </div>
    </div>
  )
}
