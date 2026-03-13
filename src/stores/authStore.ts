'use client'

import { create } from 'zustand'
import { User as SupabaseUser } from '@supabase/supabase-js'
import { User, UserRole } from '@/types/database'

interface AuthState {
  supabaseUser: SupabaseUser | null
  userProfile: User | null
  role: UserRole | null
  isLoading: boolean
  setSupabaseUser: (user: SupabaseUser | null) => void
  setUserProfile: (profile: User | null) => void
  setLoading: (loading: boolean) => void
  reset: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  supabaseUser: null,
  userProfile: null,
  role: null,
  isLoading: true,
  setSupabaseUser: (user) => set({ supabaseUser: user }),
  setUserProfile: (profile) => set({
    userProfile: profile,
    role: profile?.role ?? null,
  }),
  setLoading: (loading) => set({ isLoading: loading }),
  reset: () => set({
    supabaseUser: null,
    userProfile: null,
    role: null,
    isLoading: false,
  }),
}))
