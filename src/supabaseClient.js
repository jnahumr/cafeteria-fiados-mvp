import { createClient } from '@supabase/supabase-js'

// Leemos las credenciales desde variables de entorno (archivo .env)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)