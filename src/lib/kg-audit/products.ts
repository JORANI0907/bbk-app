/**
 * KG이니시스 심사 전용 상품 카탈로그.
 *
 * 정기 상품 4개 + 1회성 상품 30개.
 * 실제 BBK 서비스 안내 요금표에서 카테고리별 대표 품목 큐레이션.
 *
 * 이 카탈로그는 심사관에게만 노출되며, 실제 고객 결제와 무관하다.
 * 실제 운영은 관리자가 견적 확정 → 결제 링크 발급 방식.
 *
 * 심사 통과 후: 카탈로그 유지 여부는 사용자 결정.
 */

export type ProductBillingType = 'one-time' | 'subscription'

export type Product = {
  code:          string
  category:      string
  categoryIcon:  string
  label:         string
  unit:          string
  price:         number
  billingType:   ProductBillingType
  servicePeriod: string
}

// 전자상거래법상 서비스 제공기간 표기 (PG 심사 필수)
export const SERVICE_PERIOD_ONE_TIME     = '결제일로부터 1개월(30일) 이내 1회 시공 제공'
export const SERVICE_PERIOD_SUBSCRIPTION = '월 자동청구 (매월 1회 방문 · 해지 시까지 지속)'

// ─── 정기 상품 (4개) ──────────────────────────────────────
export const SUBSCRIPTION_PRODUCTS: readonly Product[] = [
  { code: 'sub-deep-1',  category: '정기딥케어',   categoryIcon: '🧽', label: '월 1회 기본형',   unit: '월', price: 150000, billingType: 'subscription', servicePeriod: SERVICE_PERIOD_SUBSCRIPTION },
  { code: 'sub-deep-2',  category: '정기딥케어',   categoryIcon: '🧽', label: '월 2회 기본형',   unit: '월', price: 270000, billingType: 'subscription', servicePeriod: SERVICE_PERIOD_SUBSCRIPTION },
  { code: 'sub-end-1',   category: '정기엔드케어', categoryIcon: '🌙', label: '기본형',          unit: '월', price: 100000, billingType: 'subscription', servicePeriod: SERVICE_PERIOD_SUBSCRIPTION },
  { code: 'sub-end-2',   category: '정기엔드케어', categoryIcon: '🌙', label: '확장형',          unit: '월', price: 180000, billingType: 'subscription', servicePeriod: SERVICE_PERIOD_SUBSCRIPTION },
] as const

// ─── 1회성 상품 (30개, 카테고리 8개) ───────────────────────
export const ONE_TIME_PRODUCTS: readonly Product[] = [
  // 주방 후드/덕트 (5)
  { code: 'ot-hood-01',  category: '주방 후드·덕트', categoryIcon: '🍳', label: '후드 (스텐)',                  unit: '대당',      price: 170000, billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },
  { code: 'ot-hood-02',  category: '주방 후드·덕트', categoryIcon: '🍳', label: '후드 덕트 전기 집진기',        unit: '대당',      price: 240000, billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },
  { code: 'ot-hood-03',  category: '주방 후드·덕트', categoryIcon: '🍳', label: '송풍기 시로코팬 후드모터',     unit: '대당',      price: 240000, billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },
  { code: 'ot-hood-04',  category: '주방 후드·덕트', categoryIcon: '🍳', label: '덕트 배관 (후드 결합시)',      unit: '대당',      price: 80000,  billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },
  { code: 'ot-hood-05',  category: '주방 후드·덕트', categoryIcon: '🍳', label: '홀 덕트 (내부)',                unit: '구역 일괄', price: 270000, billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },

  // 주방 조리기구 (5)
  { code: 'ot-cook-01',  category: '주방 조리기구', categoryIcon: '🔥', label: '가스레인지 (업소용)',          unit: '대당',      price: 150000, billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },
  { code: 'ot-cook-02',  category: '주방 조리기구', categoryIcon: '🔥', label: '튀김기 (프라이어)',            unit: '대당',      price: 190000, billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },
  { code: 'ot-cook-03',  category: '주방 조리기구', categoryIcon: '🔥', label: '컨벡션 오븐',                  unit: '대당',      price: 130000, billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },
  { code: 'ot-cook-04',  category: '주방 조리기구', categoryIcon: '🔥', label: '그리들 (전기)',                unit: '대당',      price: 80000,  billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },
  { code: 'ot-cook-05',  category: '주방 조리기구', categoryIcon: '🔥', label: '인덕션 하이라이트',            unit: '대당',      price: 60000,  billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },

  // 주방 냉장·제빙 (3)
  { code: 'ot-cold-01',  category: '주방 냉장·제빙', categoryIcon: '❄️', label: '냉장고 (수직형 스탠드)',       unit: '대당',      price: 90000,  billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },
  { code: 'ot-cold-02',  category: '주방 냉장·제빙', categoryIcon: '❄️', label: '제빙기',                       unit: '대당',      price: 80000,  billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },
  { code: 'ot-cold-03',  category: '주방 냉장·제빙', categoryIcon: '❄️', label: '워크인 창고',                  unit: '1개소당',   price: 350000, billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },

  // 주방 세척·바닥 (3)
  { code: 'ot-wash-01',  category: '주방 세척·바닥', categoryIcon: '🧼', label: '식기세척기',                   unit: '대당',      price: 170000, billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },
  { code: 'ot-wash-02',  category: '주방 세척·바닥', categoryIcon: '🧼', label: '그리스트랩',                   unit: '1개소당',   price: 150000, billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },
  { code: 'ot-wash-03',  category: '주방 세척·바닥', categoryIcon: '🧼', label: '주방 바닥 (타일)',             unit: '구역 일괄', price: 140000, billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },

  // 카페 (2)
  { code: 'ot-cafe-01',  category: '카페',           categoryIcon: '☕', label: '커피 머신',                    unit: '대당',      price: 90000,  billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },
  { code: 'ot-cafe-02',  category: '카페',           categoryIcon: '☕', label: '생맥주 라인',                  unit: '라인당',    price: 60000,  billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },

  // 화장실 (3)
  { code: 'ot-rest-01',  category: '화장실',         categoryIcon: '🚻', label: '화장실 전체 (기본 패키지)',    unit: '1개소당',   price: 170000, billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },
  { code: 'ot-rest-02',  category: '화장실',         categoryIcon: '🚻', label: '배수구 뚫기 (막힘 관통)',      unit: '1개소당',   price: 140000, billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },
  { code: 'ot-rest-03',  category: '화장실',         categoryIcon: '🚻', label: '샤워부스 및 배수구',           unit: '1개소당',   price: 140000, billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },

  // 공조·에어컨 (3)
  { code: 'ot-air-01',   category: '공조·에어컨',    categoryIcon: '🌬️', label: '에어컨 (4way 천장형)',        unit: '대당',      price: 170000, billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },
  { code: 'ot-air-02',   category: '공조·에어컨',    categoryIcon: '🌬️', label: '에어컨 (스탠드)',              unit: '대당',      price: 140000, billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },
  { code: 'ot-air-03',   category: '공조·에어컨',    categoryIcon: '🌬️', label: '에어컨 (벽걸이)',              unit: '대당',      price: 90000,  billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },

  // 바닥·실내·외부 (6)
  { code: 'ot-floor-01', category: '바닥·실내·외부', categoryIcon: '🏢', label: '바닥 (타일·폴리싱·포세린)',   unit: '구역 일괄', price: 180000, billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },
  { code: 'ot-floor-02', category: '바닥·실내·외부', categoryIcon: '🏢', label: '바닥 박리 및 코팅',            unit: '구역 일괄', price: 450000, billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },
  { code: 'ot-floor-03', category: '바닥·실내·외부', categoryIcon: '🏢', label: '카펫·러그·매트',               unit: '구역 일괄', price: 270000, billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },
  { code: 'ot-floor-04', category: '바닥·실내·외부', categoryIcon: '🏢', label: '유리창 (외창 1층)',            unit: '구역 일괄', price: 170000, billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },
  { code: 'ot-floor-05', category: '바닥·실내·외부', categoryIcon: '🏢', label: '엘리베이터',                   unit: '대당',      price: 140000, billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },
  { code: 'ot-floor-06', category: '바닥·실내·외부', categoryIcon: '🏢', label: '보도블록·진입로 고압세척',     unit: '구역 일괄', price: 340000, billingType: 'one-time', servicePeriod: SERVICE_PERIOD_ONE_TIME },
] as const

export const ALL_PRODUCTS: readonly Product[] = [...SUBSCRIPTION_PRODUCTS, ...ONE_TIME_PRODUCTS]

// ─── 유틸 ────────────────────────────────────────────────
export function findProduct(code: string): Product | undefined {
  return ALL_PRODUCTS.find((p) => p.code === code)
}

export function isSubscriptionCode(code: string): boolean {
  return findProduct(code)?.billingType === 'subscription'
}

export function calcTotalAmount(codes: readonly string[]): number {
  return codes.reduce((sum, code) => sum + (findProduct(code)?.price ?? 0), 0)
}

export function groupByCategory(products: readonly Product[]): { category: string; icon: string; items: Product[] }[] {
  const map = new Map<string, { icon: string; items: Product[] }>()
  for (const p of products) {
    const entry = map.get(p.category)
    if (entry) {
      entry.items.push(p)
    } else {
      map.set(p.category, { icon: p.categoryIcon, items: [p] })
    }
  }
  return Array.from(map.entries()).map(([category, { icon, items }]) => ({ category, icon, items }))
}
