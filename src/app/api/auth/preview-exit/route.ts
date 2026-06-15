import { NextResponse } from 'next/server'

export async function DELETE() {
  const response = NextResponse.json({ success: true })
  response.cookies.delete('bbk_preview_session')
  return response
}
