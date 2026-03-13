'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/authStore'

export function useAuth() {
  const { supabaseUser, userProfile, role, isLoading, reset } = useAuthStore()
  const router = useRouter()
  const supabase = createClient()

  const signOut = async () => {
    await supabase.auth.signOut()
    reset()
    router.push('/login')
  }

  return { user: supabaseUser, profile: userProfile, role, isLoading, signOut }
}

export function useAuthInit() {
  const { setSupabaseUser, setUserProfile, setLoading, reset } = useAuthStore()
  const supabase = createClient()

  useEffect(() => { // eslint-disable-line react-hooks/exhaustive-deps
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setLoading(true)

        if (session?.user) {
          setSupabaseUser(session.user)
          const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('auth_id', session.user.id)
            .single()
          setUserProfile(profile)
        } else {
          reset()
        }

        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])
}
