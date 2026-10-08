import {useQuery} from '@tanstack/react-query'
import {supabase} from './supabase'
import {useUnit} from './units'

export type TaskTimer = {
 id:string; task_id:string; unit_id:string; user_id:string;
 state:'ready'|'running'|'paused'|'stopped'; elapsed_seconds:number;
 started_at:string|null;last_resumed_at:string|null;ended_at:string|null;
 estimate_minutes:number; updated_at:string;
 profiles?:{full_name:string}|null;
 tasks?:{title:string;task_no:string;status:string;priority:string;due_date:string|null;estimated_minutes:number}|null
}
export type TimerEvent={id:string;timer_id:string;task_id:string;user_id:string;actor_id:string;event_type:string;reason:string|null;seconds_total:number;created_at:string}
export const timerKeys={all:['task_timers'] as string[]}
export function useTimers(){const {unitId}=useUnit();return useQuery({
 queryKey:[...timerKeys.all,unitId],queryFn:async()=>{
  let q=supabase.from('task_timers').select('*,profiles!task_timers_user_id_fkey(full_name),tasks!task_timers_task_id_fkey(title,task_no,status,priority,due_date,estimated_minutes)').order('updated_at',{ascending:false}).limit(350)
  if(unitId)q=q.eq('unit_id',unitId)
  const {data,error}=await q;if(error)throw error;return (data||[]) as TaskTimer[]
 },refetchInterval:15000
})}
export function liveSeconds(timer:Pick<TaskTimer,'state'|'elapsed_seconds'|'last_resumed_at'>|null|undefined,now=Date.now()){
 if(!timer)return 0
 const last=timer.last_resumed_at?new Date(timer.last_resumed_at).getTime():now
 return Math.max(0,Number(timer.elapsed_seconds)||0)+(timer.state==='running'?Math.max(0,Math.floor((now-last)/1000)):0)
}
export function duration(s:number){const v=Math.max(0,Math.floor(s));return `${String(Math.floor(v/3600)).padStart(2,'0')}:${String(Math.floor(v%3600/60)).padStart(2,'0')}:${String(v%60).padStart(2,'0')}`}
export function compactTime(s:number){const v=Math.max(0,Math.round(s));return `${Math.floor(v/3600)}h ${Math.floor(v%3600/60)}m`}