import { DemoShell } from '@/components/demo/DemoShell'

// 주의: title/description 은 SNS 미리보기(카카오톡·페이스북) 에도 그대로 노출됨.
// 마케팅 텍스트로 통일 (이전엔 '— 미리보기' 접미사가 붙어 링크 공유 시 어색했음)
export const metadata = {
  title: 'BBK 공간케어',
  description: '범빌드코리아 공간케어 관리 앱. 상업용 주방·시설 청소 서비스 관리, 작업자 배정, 정기 케어 스케줄을 한 곳에서.',
  robots: { index: false, follow: false },
}

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <DemoShell>{children}</DemoShell>
}
