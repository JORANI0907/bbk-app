const MAKE_DRIVE_WEBHOOK = 'https://hook.eu2.make.com/d6rjjszhes75r9wwhngqhhseevo8qttc'

/**
 * Make 시나리오를 통해 Google Drive 폴더 자동생성 요청
 * 시나리오: 정기케어 드라이브 폴더 자동생성 (BBK앱 웹훅) #9108703
 * service_type 기준으로 딥케어/엔드케어 상위 폴더에 {업체명}_{YYYY년MM월} 폴더 생성
 */
export async function triggerDriveFolderCreation(
  businessName: string,
  year: number,
  month: number,
  serviceType: string,
): Promise<void> {
  const monthStr = String(month).padStart(2, '0')
  await fetch(MAKE_DRIVE_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_name: businessName,
      year: String(year),
      month: monthStr,
      service_type: serviceType,
    }),
  })
}
