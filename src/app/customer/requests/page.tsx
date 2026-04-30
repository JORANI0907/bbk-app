import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { CustomerRequest } from '@/types/database'
import { RequestForm } from '@/components/customer/RequestForm'

export default async function CustomerRequestsPage() {
  const session = getServerSession()
  if (!session || session.role !== 'customer') redirect('/login')

  const supabase = createServiceClient()

  const { data: customerRow } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', session.userId)
    .maybeSingle()

  const customerId = customerRow?.id ?? null

  const requests: CustomerRequest[] = []
  if (customerId) {
    const { data } = await supabase
      .from('customer_requests')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
    requests.push(...(data ?? []))
  }

  return <RequestForm initialRequests={requests} />
}
