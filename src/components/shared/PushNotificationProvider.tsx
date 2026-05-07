'use client'

import { usePushNotification } from '@/hooks/usePushNotification'

type UserType = 'admin' | 'worker' | 'customer'

interface PushNotificationProviderProps {
  userId: string
  userType: UserType
}

export function PushNotificationProvider({ userId, userType }: PushNotificationProviderProps) {
  usePushNotification(userId, userType)
  return null
}
