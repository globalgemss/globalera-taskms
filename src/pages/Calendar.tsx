import {useMemo,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {CalendarDays,ArrowRight,AlertTriangle} from 'lucide-react'
import {useTasks} from '../lib/data'
import {Badge,Card,Empty,PageTitle,Select} from '../components/UI'
import {dateLabel,isOverdue} from '../lib/utils'
const localDate=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Kathmandu'})
export default function Calendar(){const {data:tasks=[]}=useTasks(),[mode,setMode]=useState('Month'),[date,setDate]=useState(localDate()),nav=useNavigate()
 const list=useMemo(()=>{const base=new Date(date+'T12:00:00'),weekday=base.getDay(),first=new Date(base);first.setDate(base.getDate()-weekday);return tasks.filter(t=>{if(!t.due_date)return false;const due=new Date(t.due_date+'T12:00:00');if(mode==='Day')return t.due_date===date;if(mode==='Week')return due>=first&&due<new Date(first.getTime()+7*86400000);return t.due_date.slice(0,7)===date.slice(0,7)}).sort((a,b)=>(a.due_date||'').localeCompare(b.due_date||''))},[tasks,date,mode])
 const groups=[...new Set(list.map(t=>t.due_date||''))]
 return <div className="fade-in"><PageTitle title="Work Calendar" description="Deadlines, follow-up priorities and upcoming work in your selected business unit."/><Card className="list-panel"><div className="list-toolbar"><div className="toolbar-select"><CalendarDays size={18}/><Select value={mode} onChange={e=>setMode(e.target.value)}><option>Day</option><option>Week</option><option>Month</option></Select></div><input className="input" aria-label="Calendar date" type="date" value={date} onChange={e=>setDate(e.target.value)}/><span className="muted">{list.length} scheduled tasks</span></div>
 {groups.map(day=><section key={day} className="calendar-day"><h3>{dateLabel(day)}</h3>{list.filter(t=>t.due_date===day).map(t=><button className="calendar-task" key={t.id} onClick={()=>nav(`/tasks/${t.id}`)}><div><strong>{t.title}</strong><small>{t.task_no} · {t.projects?.name||'General'}</small></div><Badge value={isOverdue(t)?'Overdue':t.status}/>{isOverdue(t)&&<AlertTriangle size={16}/>}<ArrowRight size={16}/></button>)}</section>)}
 {!list.length&&<Empty title="No tasks due in this period" description="Try another date or switch your business unit."/>}</Card></div>
}