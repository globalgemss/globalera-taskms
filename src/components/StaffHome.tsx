import {useEffect,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {ArrowRight,CalendarDays,AlertCircle,CheckCheck,Pause,Play,Timer,ChevronRight} from 'lucide-react'
import {useAuth} from '../lib/auth'
import {useTimers,liveSeconds,duration} from '../lib/timers'
import type {Task} from '../lib/types'
import {isOverdue,todayNP} from '../lib/utils'

export function StaffHome({tasks}:{tasks:Task[]}){
 const {profile}=useAuth(),nav=useNavigate(),{data:timers=[]}=useTimers(),[now,setNow]=useState(Date.now())
 useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id)},[])
 const mine=timers.find(t=>t.user_id===profile?.id&&t.state==='running')||timers.find(t=>t.user_id===profile?.id&&t.state==='paused')
 const today=todayNP(),overdue=tasks.filter(isOverdue).length,scheduled=tasks.filter(t=>t.due_date===today&&!['Completed','Cancelled'].includes(t.status)).length,upcoming=tasks.filter(t=>!!t.due_date&&t.due_date>today&&t.status!=='Completed').length
 return <div className="v3-staff-home">
  <div className="v3-mobile-heading"><span>GOOD MORNING · GLOBAL ERA</span><h2>My Work <span>✦</span></h2><p>One place for your tasks, updates and daily progress.</p></div>
  <div className="v3-mobile-blue" onClick={()=>mine&&nav(`/tasks/${mine.task_id}`)} role={mine?'button':undefined} tabIndex={mine?0:undefined} onKeyDown={e=>e.key==='Enter'&&mine&&nav(`/tasks/${mine.task_id}`)}>
   <div className="v3-mobile-blue-head"><span><span className="v3-live-pip"/> {mine?.state==='running'?'CURRENTLY WORKING':mine?.state==='paused'?'TIMER PAUSED':'READY WHEN YOUR MANAGER STARTS'}</span><Timer size={25}/></div>
   <h3>{mine?.tasks?.title||'Your next task is waiting'}</h3>
   <div className="v3-mobile-clock">{duration(liveSeconds(mine,now))}</div>
   <div className="v3-mobile-blue-bottom"><span>{mine?.state==='running'?'Work time is tracking in the background':mine?.state==='paused'?'Resume when ready to continue':'Open your task list to check assignments'}</span><button onClick={e=>{e.stopPropagation();nav(mine?`/tasks/${mine.task_id}`:'/tasks')}}>{mine?.state==='running'?<Pause size={16}/>:<Play size={16}/>} {mine?'Manage Timer':'My Tasks'}</button></div>
  </div>
  <div className="v3-mobile-section-head"><h3>Your Lists</h3><button onClick={()=>nav('/tasks')}>All tasks <ArrowRight size={16}/></button></div>
  <div className="v3-mobile-lists">
   {[
    {name:'Today’s Tasks',subtitle:'Priorities for today',icon:CalendarDays,count:scheduled,cls:'today'},
    {name:'Overdue Items',subtitle:'Needs your attention',icon:AlertCircle,count:overdue,cls:'overdue'},
    {name:'This Week',subtitle:'Upcoming work',icon:CalendarDays,count:upcoming,cls:'upcoming'},
    {name:'For Review',subtitle:'Waiting for approval',icon:CheckCheck,count:tasks.filter(t=>t.status==='Review').length,cls:'review'}
   ].map(x=><button key={x.name} className="v3-mobile-list" onClick={()=>nav('/tasks')}><span className={`v3-list-icon ${x.cls}`}><x.icon size={20}/></span><span className="v3-mobile-list-text"><strong>{x.name}</strong><small>{x.subtitle}</small></span><b>{x.count}</b><ChevronRight size={18}/></button>)}
  </div>
 </div>
}