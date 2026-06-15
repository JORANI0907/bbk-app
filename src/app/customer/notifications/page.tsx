import { getCustomerSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { CustomerNotificationsClient } from '@/components/customer/CustomerNotificationsClient'

export const dynamic = 'force-dynamic'

export default function CustomerNotificationsPage() {
  const session = getCustomerSession()
  if (!session || session.role !== 'customer') redirect('/login')

  return <CustomerNotificationsClient userId={session.userId} />
}
