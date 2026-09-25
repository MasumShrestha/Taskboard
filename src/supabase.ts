import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configured = !!(url && key)
// The anon key is meant to be public; row-level security in schema.sql protects the data.
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing')
