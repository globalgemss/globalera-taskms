import {useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {toast} from 'sonner'
import {api} from '../lib/supabase'
import {keys} from '../lib/data'
import {CalendarClock,Clock3,CheckCircle2,AlertTriangle} from 'lucide-react'
import {useNavigate} from 'react-router-dom'
import {useFollowups} from '../lib/data'
import {Badge,Card,Empty,Loader,PageTitle,SearchInput} from '../components/UI'
import {when,todayNP} from '../lib/utils'
export default function Followups(){const{data:items=[],isLoading}=useFollowups(),[tab,setTab]=useState('All'),[q,setQ]=useState(''),nav=useNavigate(),query=useQueryClient(),[busyId,setBusyId]=useState(''),today=todayNP()
 async function complete(id:string){if(busyId)return;setBusyId(id);try{await api('complete_followup',{followup_id:id});toast.success('Follow-up completed');await query.invalidateQueries({queryKey:keys.followups})}catch(e){toast.error((e as Error).message)}finally{setBusyId('')}}
 const status=(date:string)=>date.slice(0,10)<today?'Overdue':date.slice(0,10)===today?'Today':'Upcoming'
 const filtered=items.filter(f=>(tab==='All'||(tab==='Completed'?!!f.completed_at:!f.completed_at&&status(f.followup_at)===tab))&&(f.tasks?.title||'').toLowerCase().includes(q.toLowerCase()))
 return <div className="fade-in"><PageTitle title="Follow-up Center" description="Keep every commitment and deadline in sight."/><div className="task-summary">{[{l:'Today',i:CalendarClock,n:items.filter(f=>!f.completed_at&&status(f.followup_at)==='Today').length},{l:'Overdue',i:AlertTriangle,n:items.filter(f=>!f.completed_at&&status(f.followup_at)==='Overdue').length},{l:'Upcoming',i:Clock3,n:items.filter(f=>!f.completed_at&&status(f.followup_at)==='Upcoming').length},{l:'Completed',i:CheckCircle2,n:items.filter(f=>!!f.completed_at).length}].map(x=><Card key={x.l}><strong>{x.n}</strong><span>{x.l}</span></Card>)}</div><Card className="list-panel"><div className="list-toolbar"><SearchInput value={q} onChange={setQ} placeholder="Search task follow-ups…"/></div><div className="filter-tabs">{['All','Today','Overdue','Upcoming','Completed'].map(x=><button key={x} className={x===tab?'active':''} onClick={()=>setTab(x)}>{x}</button>)}</div>{isLoading?<Loader/>:filtered.length?<div className="followup-list">{filtered.map(f=><div className="followup-card-row" key={f.id}><span className="followup-main-icon"><CalendarClock size={20}/></span><button className="followup-text" onClick={()=>nav(`/tasks/${f.task_id}`)}><b>{f.tasks?.title||'Task follow-up'}</b><p>{f.remarks||'No remarks'}</p><small>{f.method} · {when(f.followup_at)}</small></button><Badge value={f.completed_at?'Completed':status(f.followup_at)}/>{!f.completed_at&&<button disabled={!!busyId} className="followup-complete" onClick={()=>void complete(f.id)}>Complete</button>}</div>)}</div>:<Empty title="No follow-ups match" description="Follow-ups can be scheduled from a task profile."/>}</Card></div>
}
