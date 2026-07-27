import { redirect } from 'next/navigation'

// 서비스관리 탭 흡수 후 남은 외부 유입(북마크·과거 Slack 알림 등)을 고객관리로 안내한다.
export default function Page() {
  redirect('/admin/customers')
}
