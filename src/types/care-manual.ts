export interface CareManualItem {
  label: string
  desc: string
  image_url?: string
}

export interface CareManualSection {
  section: string
  items: CareManualItem[]
  image_url?: string
}
