import { DemoShell } from '@/components/demo/DemoShell'

export const metadata = {
  title: 'BBK 공간케어 — 미리보기',
  description: '범빌드코리아 BBK 공간케어 고객 포털 미리보기',
  robots: { index: false, follow: false },
}

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <DemoShell>{children}</DemoShell>
}
