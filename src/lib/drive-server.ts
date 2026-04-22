const MAKE_DRIVE_WEBHOOK = 'https://hook.eu2.make.com/d6rjjszhes75r9wwhngqhhseevo8qttc'

/**
 * Make 시나리오를 통해 Google Drive 폴더 자동생성 요청
 * 폴더명: YYYYMMDD 업체명 (예: 20260501 삼성전자)
 * 폴더 생성 후 Make가 drive-callback API로 drive_folder_url 저장
 */
export async function triggerDriveFolderCreation(
  applicationId: string,
  businessName: string,
  constructionDate: string,
  serviceType: string,
): Promise<void> {
  await fetch(MAKE_DRIVE_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      application_id: applicationId,
      business_name: businessName,
      construction_date: constructionDate,
      service_type: serviceType,
    }),
  })
}
