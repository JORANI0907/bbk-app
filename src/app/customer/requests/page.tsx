import { createServiceClient } from '@/lib/supabase/server'
import { getCustomerSession } from '@/lib/session'
import { getPortalCustomers } from '@/lib/customer-portal'
import { redirect } from 'next/navigation'
import { CustomerRequest } from '@/types/database'
import { RequestForm } from '@/components/customer/RequestForm'

export default async function CustomerRequestsPage() {
  const session = getCustomerSession()
  if (!session || session.role !== 'customer') redirect('/login')

  const supabase = createServiceClient()

  const { ids: customerIds } = await getPortalCustomers(supabase, session.userId)

  const requests: CustomerRequest[] = []
  if (customerIds.length > 0) {
    const { data } = await supabase
      .from('customer_requests')
      .select('*')
      .in('customer_id', customerIds)
      .order('created_at', { ascending: false })
    requests.push(...(data ?? []))
  }

  return <RequestForm initialRequests={requests} />
}
