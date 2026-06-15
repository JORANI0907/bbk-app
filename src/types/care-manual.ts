export interface CareManualItem {
  label: string
  desc: string
}

export interface CareManualSection {
  section: string
  items: CareManualItem[]
}
