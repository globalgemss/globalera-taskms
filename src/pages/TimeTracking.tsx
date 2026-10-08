import {useEffect,useMemo,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {useAuth} from '../lib/auth'
import {useUnit} from '../lib/units'
import {useTimers,liveSeconds,compactTime,duration,type TaskTimer} from '../lib/timers'
import {useTasks} from '../lib/data'
import {useTaskClocks,useBreakIntervals,clockSeconds,breakSeconds,exportRowsCsv} from '../lib/work'
import {PageTitle,Card,Badge,Select,SearchInput,Empty,Loader} from '../components/UI'
import {Timer,PlayCircle,PauseCircle,Clock3,CalendarClock,Download,ChevronRight} from 'lucide-react'

export default function TimeTracking(){
 const {profile}=useAuth(),{unit}=useUnit(),nav=useNavigate(),{data:timers=[],isLoading,error}=useTimers(),{data:tasks=[]}=useTasks(),{data:clocks=[]}=useTaskClocks(),{data:breaks=[]}=useBreakIntervals()
 const [now,setNow]=useState(Date.now()),[filter,setFilter]=useState('All'),[search,setSearch]=useState('')
 useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id)},[])
 const list=useMemo(()=>timers.filter(t=>(filter==='All'||t.state===filter)&&[t.tasks?.title,t.tasks?.task_no,t.profiles?.full_name].join(' ').toLowerCase().includes(search.toLowerCase())),[timers,filter,search])
 const running=timers.filter(t=>t.state==='running').length,paused=timers.filter(t=>t.state==='paused').length,seconds=timers.reduce((a,t)=>a+liveSeconds(t,now),0)
 const elapsedTotal=clocks.reduce((n,c)=>n+clockSeconds(c,now),0),breakTotal=breaks.reduce((n,b)=>n+breakSeconds(b,now),0)
 const active=new Set(timers.filter(t=>t.state==='running').map(t=>t.user_id)).size
 function csv(){const header=['Task','Staff','Unit','Timer status','Staff seconds','Break seconds','Admin elapsed seconds','Estimated minutes','Task status'];const rows=list.map(t=>[t.tasks?.title||'',t.profiles?.full_name||'',unit?.name||'',t.state,liveSeconds(t,now),breaks.filter(b=>b.task_id===t.task_id&&b.user_id===t.user_id).reduce((n,b)=>n+breakSeconds(b,now),0),clockSeconds(clocks.filter(c=>c.task_id===t.task_id).sort((a,b)=>b.cycle-a.cycle)[0],now),t.estimate_minutes||t.tasks?.estimated_minutes||0,t.tasks?.status||'']);exportRowsCsv('TaskMS_Dual_Timer_Report.csv',header,rows)}
 return <div className="fade-in v3-time-page"><PageTitle title="Time Tracking" description="Live timers, work sessions and staff productivity across your business units." action={<button className="btn btn-secondary" onClick={csv}><Download size={17}/> Export CSV</button>}/>
 <div className="v3-metric-grid"><Card><Timer size={21}/><strong>{running}</strong><span>Running timers</span></Card><Card><PauseCircle size={21}/><strong>{paused}</strong><span>Paused timers</span></Card><Card><PlayCircle size={21}/><strong>{active}</strong><span>Staff working</span></Card><Card><Clock3 size={21}/><strong>{compactTime(seconds)}</strong><span>Staff logged hours</span></Card><Card><Clock3 size={21}/><strong>{compactTime(elapsedTotal)}</strong><span>Admin elapsed clock</span></Card><Card><PauseCircle size={21}/><strong>{compactTime(breakTotal)}</strong><span>Staff break time</span></Card></div>
 <Card className="v3-time-table"><div className="v3-time-toolbar"><div><h3>Staff timer activity</h3><p>Server-authoritative work time · unit filtered</p></div><div className="v3-time-filters"><SearchInput value={search} onChange={setSearch} placeholder="Search task or staff"/><Select value={filter} onChange={e=>setFilter(e.target.value)}><option value="All">All timers</option><option value="running">Running</option><option value="paused">Paused</option><option value="stopped">Stopped</option></Select></div></div>
 {isLoading?<Loader/>:error?<div className="error-box">{(error as Error).message}</div>:!list.length?<Empty title="No timers yet" description="An authorized manager can start a timer from the assigned task details."/>:<div className="responsive-table"><table><thead><tr><th>Task / Staff</th><th>Status</th><th>Logged work</th><th>Breaks</th><th>Admin elapsed</th><th>Estimate</th><th>Task progress</th><th/></tr></thead><tbody>{list.map(t=><tr key={t.id} className="click-row" onClick={()=>nav(`/tasks/${t.task_id}`)}><td><strong>{t.tasks?.title||'Task'}</strong><small>{t.profiles?.full_name||'Staff'} · {t.tasks?.task_no||''}</small></td><td><Badge value={t.state}/></td><td className="v3-mono">{duration(liveSeconds(t,now))}</td><td className="v3-mono">{duration(breaks.filter(b=>b.task_id===t.task_id&&b.user_id===t.user_id).reduce((n,b)=>n+breakSeconds(b,now),0))}</td><td className="v3-mono">{duration(clockSeconds(clocks.filter(c=>c.task_id===t.task_id).sort((a,b)=>b.cycle-a.cycle)[0],now))}</td><td>{t.estimate_minutes||t.tasks?.estimated_minutes||0} min</td><td><Badge value={t.tasks?.status||'Assigned'}/></td><td><ChevronRight size={17}/></td></tr>)}</tbody></table></div>}
 </Card>
 {profile?.role==='staff'&&<p className="v3-helper"><CalendarClock size={16}/> Start Work yourself from Task Details, then Pause/Resume when needed. Holiday work requires manager approval.</p>}
 <p className="v3-helper">The Admin Clock runs from assignment to approval, while Staff Work excludes breaks. Logged hours are not proof of continuously active work. Managers verify entries during review. Loaded tasks: {tasks.length}.</p>
 </div>
}