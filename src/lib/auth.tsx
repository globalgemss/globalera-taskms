import {createContext,useContext,useEffect,useState,type ReactNode} from 'react'
import type {Session} from '@supabase/supabase-js'
import {supabase} from './supabase'
import type {Profile} from './types'
type State={session:Session|null,profile:Profile|null,loading:boolean,refresh:()=>Promise<void>}
const Ctx=createContext<State>({session:null,profile:null,loading:true,refresh:async()=>{}})
export const useAuth=()=>useContext(Ctx)
export function AuthProvider({children}:{children:ReactNode}){
 const [session,setSession]=useState<Session|null>(null),[profile,setProfile]=useState<Profile|null>(null),[loading,setLoading]=useState(true)
 const refresh=async()=>{const {data:{session:s}}=await supabase.auth.getSession();setSession(s);if(!s){setProfile(null);setLoading(false);return}
  const{data,error}=await supabase.from('profiles').select('*,departments(name)').eq('id',s.user.id).maybeSingle()
  if(error||!data||data.status!=='Active'){setProfile(null);await supabase.auth.signOut();setSession(null)}else setProfile(data as Profile)
  setLoading(false)
 }
 useEffect(()=>{let live=true;supabase.auth.getSession().then(()=>{if(live)void refresh()});const{data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>{setSession(s);setTimeout(()=>{if(live)void refresh()},0)})
 return()=>{live=false;subscription.unsubscribe()}},[])
 return <Ctx.Provider value={{session,profile,loading,refresh}}>{children}</Ctx.Provider>
}
