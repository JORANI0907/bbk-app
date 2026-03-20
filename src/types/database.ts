export type UserRole = 'admin' | 'worker' | 'customer'

export type PipelineStatus =
  | 'inquiry' | 'quote_sent' | 'consulting' | 'contracted'
  | 'schedule_assigned' | 'service_scheduled' | 'service_done'
  | 'payment_done' | 'subscription_active' | 'renewal_pending' | 'churned'

export type ScheduleStatus =
  | 'scheduled' | 'confirmed' | 'in_progress' | 'completed'
  | 'cancelled' | 'rescheduled'

export type PaymentStatus = 'pending' | 'invoiced' | 'paid' | 'overdue'

export type PhotoType = 'before' | 'after' | 'during' | 'damage' | 'closing'

export type ContractType = 'onetime' | 'subscription'

export type ServiceGrade = 'Z_WHITE' | 'G_BLUE' | 'D_BLACK'

export type InventoryCategory = 'chemical' | 'equipment' | 'consumable' | 'other'

export interface User {
  id: string
  auth_id: string | null
  role: UserRole
  name: string
  phone: string
  email: string | null
  avatar_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Customer {
  id: string
  user_id: string | null
  business_name: string
  business_number: string | null
  address: string
  address_detail: string | null
  latitude: number | null
  longitude: number | null
  contact_name: string
  contact_phone: string
  door_password: string | null
  gas_location: string | null
  power_location: string | null
  parking_info: string | null
  special_notes: string | null
  drive_folder_url: string | null
  pipeline_status: PipelineStatus
  created_at: string
  updated_at: string
}

export interface Contract {
  id: string
  customer_id: string
  contract_type: ContractType
  subscription_plan: 'cycle_3' | 'cycle_6' | 'cycle_12' | null
  visit_frequency: 'standard' | 'double' | 'triple' | null
  service_grade: ServiceGrade
  selected_items: ServiceItem[]
  monthly_price: number | null
  annual_price: number | null
  start_date: string | null
  end_date: string | null
  contract_year: number
  discount_rate: number
  status: 'draft' | 'active' | 'expired' | 'terminated' | 'renewed'
  created_at: string
  updated_at: string
}

export interface ServiceItem {
  id: string
  name: string
  category: string
}

export interface ServiceSchedule {
  id: string
  customer_id: string
  contract_id: string | null
  worker_id: string | null
  scheduled_date: string
  scheduled_time_start: string
  scheduled_time_end: string
  items_this_visit: ServiceItem[]
  status: ScheduleStatus
  work_step: number
  actual_arrival: string | null
  actual_completion: string | null
  arrival_lat: number | null
  arrival_lng: number | null
  worker_memo: string | null
  memo_visible: boolean
  payment_status: PaymentStatus
  payment_amount: number | null
  payment_date: string | null
  created_at: string
  updated_at: string
  // 조인 데이터
  customer?: Customer
  worker?: User
}

export interface ChecklistItem {
  step: string
  done: boolean
  done_at?: string
}

export interface WorkChecklist {
  id: string
  schedule_id: string
  item_name: string
  checklist_items: ChecklistItem[]
  is_completed: boolean
  completed_at: string | null
  created_at: string
}

export interface WorkPhoto {
  id: string
  schedule_id: string
  checklist_id: string | null
  photo_type: PhotoType
  storage_path: string
  photo_url: string
  taken_at: string
  gps_lat: number | null
  gps_lng: number | null
  uploaded_by: string | null
}

export interface ClosingChecklist {
  id: string
  schedule_id: string
  garbage_disposal: boolean
  gas_valve_check: boolean
  electric_check: boolean
  security_check: boolean
  door_lock_check: boolean
  customer_rating: number | null
  customer_comment: string | null
  completed_at: string | null
  created_at: string
}

export interface Attendance {
  id: string
  worker_id: string
  work_date: string
  clock_in: string | null
  clock_in_lat: number | null
  clock_in_lng: number | null
  clock_out: string | null
  clock_out_lat: number | null
  clock_out_lng: number | null
}

export interface InventoryItem {
  id: string
  category: InventoryCategory
  item_name: string
  current_qty: number
  unit: string
  min_qty: number
  last_updated: string
}

export interface CustomerRequest {
  id: string
  customer_id: string
  user_id: string
  content: string
  is_read: boolean
  created_at: string
}

export interface InventoryLog {
  id: string
  inventory_id: string
  worker_id: string | null
  schedule_id: string | null
  change_type: 'use' | 'receive' | 'return' | 'adjust'
  quantity: number
  note: string | null
  created_at: string
}
