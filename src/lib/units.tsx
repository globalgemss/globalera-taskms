import {createContext,useContext,useEffect,useMemo,useState,type ReactNode} from 'react'
import {useQuery} from '@tanstack/react-query'
import {supabase} from './supabase'
import {useAuth} from './auth'
export type BusinessUnit={id:string,code:string,name:string,color:string,description:string|null,status:string}
type Context={units:BusinessUnit[],unitId:string,setUnitId:(value:string)=>void,unit:BusinessUnit|null,loading:boolean}
const UnitContext=createContext<Context|null>(null)
export function UnitsProvider({children}:{children:ReactNode}){
 const {profile}=useAuth()
 const [choice,setChoice]=useState('')
 useEffect(()=>{setChoice('')},[profile?.id])
 const {data:units=[],isLoading}=useQuery({queryKey:['business_units',profile?.id],enabled:!!profile,queryFn:async()=>{const{data,error}=await supabase.from('business_units').select('id,code,name,color,description,status').eq('status','Active').order('name');if(error)throw error;return(data||[]) as BusinessUnit[]}})
 const unitId=useMemo(()=>choice&&units.some(u=>u.id===choice)?choice:profile?.role==='admin'?'':(units[0]?.id||''),[choice,units,profile?.role])
 const value=useMemo(()=>({units,unitId,setUnitId:setChoice,unit:units.find(u=>u.id===unitId)||null,loading:isLoading}),[units,unitId,isLoading])
 return <UnitContext.Provider value={value}>{children}</UnitContext.Provider>
}
export function useUnit(){const context=useContext(UnitContext);if(!context)throw Error('Unit provider unavailable');return context}