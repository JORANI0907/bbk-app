import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { INVENTORY_CATEGORY_LABELS } from '@/lib/constants'
import { InventoryCategory } from '@/types/database'

export default async function InventoryPage() {
  const supabase = createClient()

  const { data: items } = await supabase
    .from('inventory')
    .select('*')
    .order('category')
    .order('item_name')

  const lowStockItems = items?.filter(item => item.current_qty <= item.min_qty) ?? []

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">재고 관리</h1>
        {lowStockItems.length > 0 && (
          <Badge variant="danger">부족 {lowStockItems.length}건</Badge>
        )}
      </div>

      {lowStockItems.length > 0 && (
        <Card className="p-4 mb-4 border-red-200 bg-red-50">
          <h2 className="font-semibold text-red-700 mb-2">⚠️ 재고 부족 알림</h2>
          <ul className="text-sm text-red-600 space-y-1">
            {lowStockItems.map(item => (
              <li key={item.id}>
                {item.item_name}: 현재 {item.current_qty}{item.unit} (최소 {item.min_qty}{item.unit})
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-3">
        {items?.map(item => (
          <Card key={item.id} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-gray-400">
                    {INVENTORY_CATEGORY_LABELS[item.category as InventoryCategory]}
                  </span>
                  {item.current_qty <= item.min_qty && (
                    <Badge variant="danger" className="text-xs">부족</Badge>
                  )}
                </div>
                <p className="font-medium text-gray-900">{item.item_name}</p>
              </div>
              <div className="text-right">
                <p className={`text-lg font-bold ${item.current_qty <= item.min_qty ? 'text-red-600' : 'text-gray-900'}`}>
                  {item.current_qty}
                  <span className="text-sm font-normal text-gray-500 ml-1">{item.unit}</span>
                </p>
                <p className="text-xs text-gray-400">최소 {item.min_qty}{item.unit}</p>
              </div>
            </div>
          </Card>
        ))}

        {(!items || items.length === 0) && (
          <div className="text-center py-12 text-gray-500">
            등록된 재고가 없습니다.
          </div>
        )}
      </div>
    </div>
  )
}
