'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from '@hello-pangea/dnd'
import { createClient } from '@/lib/supabase/client'
import { Customer, PipelineStatus } from '@/types/database'
import { PIPELINE_KANBAN_COLUMNS } from '@/lib/constants'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

type GroupedCustomers = Record<PipelineStatus, Customer[]>

export default function AdminCustomersPage() {
  const supabase = createClient()
  const [grouped, setGrouped] = useState<GroupedCustomers>({} as GroupedCustomers)
  const [loading, setLoading] = useState(true)

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('고객 조회 오류:', error.message)
    } else if (data) {
      const initial: GroupedCustomers = {} as GroupedCustomers
      PIPELINE_KANBAN_COLUMNS.forEach(({ status }) => {
        initial[status] = []
      })
      data.forEach((c) => {
        const customer = c as Customer
        if (initial[customer.pipeline_status]) {
          initial[customer.pipeline_status].push(customer)
        }
      })
      setGrouped(initial)
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  const handleDragEnd = async (result: DropResult) => {
    const { draggableId, source, destination } = result
    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    const sourceStatus = source.droppableId as PipelineStatus
    const destStatus = destination.droppableId as PipelineStatus

    // 낙관적 업데이트
    const sourceList = [...(grouped[sourceStatus] ?? [])]
    const destList = sourceStatus === destStatus ? sourceList : [...(grouped[destStatus] ?? [])]
    const [movedCustomer] = sourceList.splice(source.index, 1)

    if (!movedCustomer) return

    const updatedCustomer: Customer = { ...movedCustomer, pipeline_status: destStatus }
    destList.splice(destination.index, 0, updatedCustomer)

    const newGrouped: GroupedCustomers = {
      ...grouped,
      [sourceStatus]: sourceStatus === destStatus ? destList : sourceList,
      [destStatus]: destList,
    }
    setGrouped(newGrouped)

    // Supabase 업데이트
    const { error } = await supabase
      .from('customers')
      .update({ pipeline_status: destStatus, updated_at: new Date().toISOString() })
      .eq('id', draggableId)

    if (error) {
      console.error('파이프라인 업데이트 오류:', error.message)
      // 롤백
      fetchCustomers()
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">고객 관리</h1>
        <Button onClick={() => alert('고객 추가 기능은 준비 중입니다.')}>
          + 고객 추가
        </Button>
      </div>

      {/* 칸반 보드 */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {PIPELINE_KANBAN_COLUMNS.map((col) => {
            const customers = grouped[col.status] ?? []
            return (
              <div
                key={col.status}
                className={`flex-shrink-0 w-64 rounded-xl border-2 ${col.color} p-3 flex flex-col gap-2`}
              >
                {/* 컬럼 헤더 */}
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-gray-700">{col.label}</span>
                  <span className="text-xs bg-white rounded-full px-2 py-0.5 text-gray-500 font-medium shadow-sm">
                    {customers.length}
                  </span>
                </div>

                {/* 드롭 영역 */}
                <Droppable droppableId={col.status}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`min-h-24 flex flex-col gap-2 rounded-lg transition-colors ${
                        snapshot.isDraggingOver ? 'bg-white/60' : ''
                      }`}
                    >
                      {customers.map((customer, index) => (
                        <Draggable key={customer.id} draggableId={customer.id} index={index}>
                          {(draggableProvided, draggableSnapshot) => (
                            <div
                              ref={draggableProvided.innerRef}
                              {...draggableProvided.draggableProps}
                              {...draggableProvided.dragHandleProps}
                              className={`bg-white rounded-lg p-3 shadow-sm border border-gray-100 select-none transition-shadow ${
                                draggableSnapshot.isDragging ? 'shadow-lg ring-2 ring-blue-400' : 'hover:shadow-md'
                              }`}
                            >
                              <p className="text-sm font-semibold text-gray-900 truncate">
                                {customer.business_name}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5 truncate">
                                {customer.contact_name} · {customer.contact_phone}
                              </p>
                              <p className="text-xs text-gray-400 mt-1 truncate">{customer.address}</p>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            )
          })}
        </div>
      </DragDropContext>
    </div>
  )
}
