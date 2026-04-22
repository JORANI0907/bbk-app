const DRIVE_FOLDER_URLS: Record<string, string> = {
  '정기딥케어':  'https://drive.google.com/drive/folders/16UywcHqJ1FVnYC4626HH4enrWbwMNUjn',
  '정기엔드케어': 'https://drive.google.com/drive/folders/1e7LomsZlDLdDR5KZKgKYFjFij8MDy6sO',
}

export function getServiceDriveFolderUrl(serviceType: string): string | null {
  return DRIVE_FOLDER_URLS[serviceType] ?? null
}
