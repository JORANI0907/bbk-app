import { createClient } from '@/lib/supabase/client'
import type { ShoppingItem, ShoppingStatus, ShoppingSite } from './shopping-types'

export async function getShoppingItems(status?: ShoppingStatus): Promise<ShoppingItem[]> {
  const supabase = createClient()
  let q = supabase.from('shopping_items').select('*')
  if (status) q = q.eq('status', status)
  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getKnownCategories(): Promise<string[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('shopping_items').select('category').not('category', 'is', null)
  if (error) throw error
  const set = new Set<string>()
  for (const row of data ?? []) if (row.category) set.add(row.category as string)
  return [...set]
}

export async function createShoppingItem(
  input: Partial<Omit<ShoppingItem, 'id' | 'created_at' | 'updated_at'>> & { title: string }
): Promise<ShoppingItem> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('shopping_items').insert(input).select().single()
  if (error) throw error
  return data
}

export async function updateShoppingItem(
  id: string,
  updates: Partial<Omit<ShoppingItem, 'id' | 'created_at' | 'updated_at'>>
): Promise<ShoppingItem> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('shopping_items').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function markPurchased(id: string, purchased: boolean): Promise<ShoppingItem> {
  return updateShoppingItem(id, {
    status: purchased ? 'purchased' : 'pending',
    purchased_at: purchased ? new Date().toISOString() : null,
  })
}

export async function deleteShoppingItem(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('shopping_items').delete().eq('id', id)
  if (error) throw error
}

export async function getPendingCount(): Promise<number> {
  const supabase = createClient()
  const { count, error } = await supabase
    .from('shopping_items').select('id', { count: 'exact', head: true }).eq('status', 'pending')
  if (error) throw error
  return count ?? 0
}

// ─── Shopping Sites ───────────────────────────────────────────

export async function getShoppingSites(): Promise<ShoppingSite[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('shopping_sites').select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createShoppingSite(input: { name: string; url: string }): Promise<ShoppingSite> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('shopping_sites').insert(input).select().single()
  if (error) throw error
  return data
}

export async function updateShoppingSite(
  id: string, updates: Partial<Pick<ShoppingSite, 'name' | 'url' | 'sort_order'>>
): Promise<ShoppingSite> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('shopping_sites').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteShoppingSite(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('shopping_sites').delete().eq('id', id)
  if (error) throw error
}
