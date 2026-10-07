import { createClient } from '@supabase/supabase-js'
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
export const configured = Boolean(url && key && !url.includes('YOUR-PROJECT'))
export const supabase = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder-publishable-key', {
  auth: {persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
})
export async function api<T=unknown>(action:string,payload:Record<string,unknown>={}):Promise<T>{
  const {data,error} = await supabase.functions.invoke('task-api',{body:{action,...payload}})
  if(error) {
    const body = await error.context?.json?.().catch(()=>null)
    throw new Error(body?.error || error.message || 'Server error')
  }
  if(data?.error) throw new Error(data.error)
  return data as T
}
export async function publicAuth<T=unknown>(action:string,token:string,pin?:string):Promise<T>{
  const {data,error} = await supabase.functions.invoke('staff-auth',{body:{action,token,pin}})
  if(error){const body=await error.context?.json?.().catch(()=>null);throw new Error(body?.error||error.message)}
  if(data?.error) throw new Error(data.error)
  return data as T
}
