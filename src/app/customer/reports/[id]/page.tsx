import { redirect } from 'next/navigation'

interface PageProps {
  params: { id: string }
}

export default function CustomerReportDetailPage({ params }: PageProps) {
  redirect(`/customer/schedule/${params.id}`)
}
