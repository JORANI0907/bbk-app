'use client'

import { useEffect, useRef } from 'react'

type UserType = 'admin' | 'worker' | 'customer'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i)
  }
  return output
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function usePushNotification(userId: string | null, userType: UserType) {
  const subscribedRef = useRef(false)

  useEffect(() => {
    if (!userId || subscribedRef.current) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    const register = async () => {
      try {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return

        const registration = await navigator.serviceWorker.register('/sw-push.js')
        await navigator.serviceWorker.ready

        const existing = await registration.pushManager.getSubscription()
        const vapidKey = urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!)
        const subscription =
          existing ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: vapidKey.buffer as ArrayBuffer,
          }))

        const p256dhKey = subscription.getKey('p256dh')
        const authKey = subscription.getKey('auth')

        if (!p256dhKey || !authKey) return

        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            userType,
            endpoint: subscription.endpoint,
            p256dh: arrayBufferToBase64(p256dhKey),
            auth: arrayBufferToBase64(authKey),
            deviceInfo: {
              userAgent: navigator.userAgent,
              platform: navigator.platform,
            },
          }),
        })

        subscribedRef.current = true
      } catch {
        // 푸시 구독 실패는 조용히 처리
      }
    }

    register()
  }, [userId, userType])
}
