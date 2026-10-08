import {useEffect,useState} from 'react'
import {Timer,Pause,Play,Square,Clock3,CheckCircle2} from 'lucide-react'
import {useQuery,useQueryClient} from '@tanstack/react-query'
import {toast} from 'sonner'
import {api,supabase} from '../lib/supabase'
import {useAuth} from '../lib/auth'
import {useTimers,liveSeconds,duration,timerKeys,type TaskTimer} from '../lib/timers'
import {Btn,Badge,Surface,Field,Select,TextArea} from './UI'
import {keys} from '../lib/data'

export function TimerPanel({taskId,assignees=[],isManager=false}:{taskId:string;assignees?:{user_id:string;profiles?:{full_name:string}|null}[];isManager?:boolean}){
 const{profile}=useAuth(),{data:timers=[],isLoading,error}=useTimers(),query=useQueryClient()
 const [now,setNow]=useState(Date.now()),[busy,setBusy]=useState(false),[reason,setReason]=useState('Break'),[reasonDetail,setReasonDetail]=useState(''),[reasonOpen,setReasonOpen]=useState<TaskTimer|null>(null),[verifyOpen,setVerifyOpen]=useState<TaskTimer|null>(null),[verifiedMin,setVerifiedMin]=useState(''),[verifyRemarks,setVerifyRemarks]=useState('')
 useEffect(()=>{const h=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(h)},[])
 const records=timers.filter(t=>t.task_id===taskId)
 const {data:events=[]}=useQuery({queryKey:['timer-events',taskId],queryFn:async()=>{const {data,error}=await supabase.from('task_timer_events').select('id,event_type,reason,created_at,user_id,actor_id').eq('task_id',taskId).order('created_at',{ascending:false}).limit(80);if(error)throw error;return data||[]}})
 const {data:reviews=[]}=useQuery({queryKey:['time-reviews',taskId],queryFn:async()=>{const {data,error}=await supabase.from('task_time_reviews').select('id,user_id,verified_seconds,logged_seconds,remarks,reviewed_at').eq('task_id',taskId).order('reviewed_at',{ascending:false}).limit(50);if(error)throw error;return data||[]}})
 async function verify(){if(!verifyOpen||busy)return;setBusy(true);try{const secs=Math.round(Number(verifiedMin)*60);if(!Number.isFinite(secs)||secs<0)throw Error('Enter valid minutes');await api('verify_task_time',{task_id:taskId,user_id:verifyOpen.user_id,verified_seconds:secs,remarks:verifyRemarks});toast.success('Time verified');await Promise.all([query.invalidateQueries({queryKey:['time-reviews',taskId]}),query.invalidateQueries({queryKey:['timeline',taskId]})]);setVerifyOpen(null)}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}
 
 const currentAssignees=assignees.length?assignees:records.map(t=>({user_id:t.user_id,profiles:t.profiles}))
 async function control(action:'start'|'pause'|'resume'|'stop',userId:string,why=''){
  if(busy)return;setBusy(true)
  try{
   await api('timer_transition',{task_id:taskId,user_id:userId,timer_action:action,reason:why,request_id:crypto.randomUUID()})
   toast.success(action==='start'?'Timer started':action==='pause'?'Timer paused':action==='resume'?'Timer resumed':'Timer stopped')
   await Promise.all([query.invalidateQueries({queryKey:timerKeys.all}),query.invalidateQueries({queryKey:keys.tasks}),query.invalidateQueries({queryKey:['timeline',taskId]})])
  }catch(e){toast.error((e as Error).message)}finally{setBusy(false);setReasonOpen(null)}
 }
 return <section className="v3-timer-panel">
  <div className="v3-timer-title"><div><span className="v3-overline">SMART TIME TRACKING</span><h3>Live work timers</h3><p>Manager starts · Staff pauses or resumes · All actions are audited</p></div><Timer size={22}/></div>
  {isLoading?<div className="muted">Loading timers…</div>:error?<p className="error-box">{(error as Error).message}</p>:currentAssignees.length===0?<p className="muted">Assign a staff member to start tracking work.</p>:<div className="v3-timer-list">
   {currentAssignees.map(a=>{const t=records.find(x=>x.user_id===a.user_id);const state=t?.state||'ready',mine=profile?.id===a.user_id,worked=liveSeconds(t,now);return <div className={`v3-timer-person v3-timer-${state}`} key={a.user_id}>
    <div className="v3-timer-person-top"><strong>{a.profiles?.full_name||t?.profiles?.full_name||'Staff member'}</strong><Badge value={state==='ready'?'Not Started':state==='running'?'Running':state==='paused'?'Paused':'Stopped'}/></div>
    <div className="v3-digit"><Clock3 size={19}/><span>{duration(worked)}</span></div>
    <div className="v3-timer-hint">Logged time · {t?.estimate_minutes||0} min estimated{t?.last_resumed_at&&state==='running'?' · Live':''}</div>
    <div className="v3-timer-actions">
     {isManager&&(state==='ready'||state==='stopped')&&<Btn disabled={busy} onClick={()=>void control('start',a.user_id)}><Play size={15}/> {state==='stopped'?'Start again':'Start timer'}</Btn>}
     {(mine||isManager)&&state==='running'&&<Btn disabled={busy} variant="secondary" onClick={()=>setReasonOpen(t||null)}><Pause size={15}/> Pause</Btn>}
     {(mine||isManager)&&state==='paused'&&<Btn disabled={busy} onClick={()=>void control('resume',a.user_id)}><Play size={15}/> Resume</Btn>}
     {isManager&&(state==='running'||state==='paused')&&<Btn disabled={busy} variant="ghost" onClick={()=>{if(window.confirm('Stop this staff timer? This will be recorded.'))void control('stop',a.user_id,'Manager stopped the timer')}}><Square size={15}/> Stop</Btn>}
     {state==='stopped'&&<span className="v3-done"><CheckCircle2 size={15}/> Work time saved</span>}
     {isManager&&state==='stopped'&&<Btn variant="secondary" disabled={busy} onClick={()=>{setVerifyOpen(t||null);setVerifiedMin(String(Math.round(worked/60)));setVerifyRemarks('')}}><CheckCircle2 size={15}/> Verify time</Btn>}
     {reviews.find(r=>r.user_id===a.user_id)&&<span className="v3-done">Verified: {duration(reviews.find(r=>r.user_id===a.user_id)!.verified_seconds)}</span>}
    </div>
   </div>})}
  </div>}
  {events.length>0&&<details className="v3-timer-log"><summary>Timer activity log · {events.length} events</summary><div>{events.map(e=><div key={e.id}><b>{e.event_type.toUpperCase()}</b><span>{new Date(e.created_at).toLocaleString('en-NP',{timeZone:'Asia/Kathmandu'})}</span><small>{e.reason||''}</small></div>)}</div></details>}
  <Surface open={Boolean(verifyOpen)} onOpenChange={v=>!v&&setVerifyOpen(null)} title="Verify logged work time" description="Keep an auditable record of time corrections." size="compact" footer={<><Btn variant="secondary" onClick={()=>setVerifyOpen(null)}>Cancel</Btn><Btn disabled={busy} onClick={()=>void verify()}>Save Verified Time</Btn></>}><Field label="Verified minutes"><input type="number" className="input" min={0} step="1" value={verifiedMin} onChange={e=>setVerifiedMin(e.target.value)}/></Field><Field label="Reason (required when adjusted)"><TextArea rows={3} value={verifyRemarks} onChange={e=>setVerifyRemarks(e.target.value)}/></Field></Surface>
  <Surface open={Boolean(reasonOpen)} onOpenChange={v=>!v&&setReasonOpen(null)} title="Pause work timer" description="Record why work was paused. Deadline continues to count down." size="compact" footer={<><Btn variant="secondary" onClick={()=>setReasonOpen(null)}>Cancel</Btn><Btn disabled={busy} onClick={()=>{if(reasonOpen)void control('pause',reasonOpen.user_id,reason==='Other work'&&reasonDetail?'Other: '+reasonDetail:reason)}}><Pause size={15}/> Pause timer</Btn></>}>
   <Field label="Pause reason"><Select value={reason} onChange={e=>setReason(e.target.value)}><option>Break</option><option>Waiting for materials</option><option>Waiting for approval</option><option>Technical issue</option><option>Other work</option></Select></Field>
   <Field label="Optional details"><TextArea rows={2} value={reasonDetail} placeholder="Additional information…" onChange={e=>setReasonDetail(e.target.value)}/></Field>
  </Surface>
 </section>
}