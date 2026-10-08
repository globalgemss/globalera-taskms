import {useState,type DragEvent} from 'react'
import {CalendarClock,GripVertical,Timer,ArrowUpRight,MoveRight} from 'lucide-react'
import type {Task} from '../lib/types'
import {Badge} from './UI'
import {dateLabel,isOverdue} from '../lib/utils'
import {compactTime,liveSeconds,type TaskTimer} from '../lib/timers'

type Column={label:string;key:string;group:string;matches:(t:Task)=>boolean}
const columns:Column[]=[
 {label:'To Do',key:'Assigned',group:'todo',matches:t=>['New','Assigned','Waiting','On Hold'].includes(t.status)},
 {label:'In Progress',key:'In Progress',group:'progress',matches:t=>t.status==='In Progress'},
 {label:'In Review',key:'Review',group:'review',matches:t=>t.status==='Review'},
 {label:'Completed',key:'Completed',group:'done',matches:t=>t.status==='Completed'}
]
export function SmartKanbanBoard({tasks,timers,role,disabled,onMove,onOpen}:{tasks:Task[];timers:TaskTimer[];role:string;disabled:boolean;onMove:(t:Task,column:string)=>void;onOpen:(t:Task)=>void}){
 const [over,setOver]=useState<string|null>(null),[dragId,setDragId]=useState<string|null>(null)
 function drop(event:DragEvent<HTMLDivElement>,key:string){event.preventDefault();setOver(null);const id=event.dataTransfer.getData('text/task-id')||dragId;setDragId(null);const task=tasks.find(t=>t.id===id);if(task&&!disabled)onMove(task,key)}
 const isManager=role==='admin'||role==='manager'
 const availableMoves=(t:Task)=>columns.filter(x=>{if(role==='staff')return t.status==='In Progress'&&x.key==='Review'; if(t.status==='In Progress')return x.key==='Assigned'||x.key==='Review';if(t.status==='Review')return x.key==='In Progress'||x.key==='Completed';if(['Assigned','On Hold','Waiting'].includes(t.status))return x.key==='In Progress';return false})
 return <div className="v33-kanban" aria-label="Task Kanban Board">{columns.map(col=><section key={col.key} className={`v33-kanban-col v33-col-${col.group} ${over===col.key?'v33-drag-over':''}`} aria-label={col.label} onDragEnter={e=>{if(isManager){e.preventDefault();setOver(col.key)}}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setOver(null)}} onDragOver={e=>{if(isManager)e.preventDefault()}} onDrop={e=>drop(e,col.key)}>
  <div className="v33-kanban-heading"><span className="v33-kanban-dot"/><h3>{col.label}</h3><span className="v33-kanban-count">{tasks.filter(col.matches).length}</span></div>
  <div className="v33-kanban-stack">{tasks.filter(col.matches).length?tasks.filter(col.matches).map(t=><article key={t.id} className={`v33-kanban-task ${isOverdue(t)?'v33-overdue':''}`} draggable={isManager&&!disabled} onDragStart={e=>{setDragId(t.id);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/task-id',t.id)}} onDragEnd={()=>{setOver(null);setDragId(null)}}>
   <div className="v33-task-eyebrow"><span>{t.task_no}</span><Badge value={t.priority}/></div>
   <button className="v33-task-title" onClick={()=>onOpen(t)} title="Open task details">{t.title}<ArrowUpRight size={15}/></button>
   <small className="v33-task-project">{t.projects?.name||'General Task'}</small>
   <div className="v33-task-footer"><span><CalendarClock size={13}/>{dateLabel(t.due_date)}</span><span><Timer size={13}/>{compactTime(timers.filter(z=>z.task_id===t.id).reduce((a,z)=>a+liveSeconds(z),0))}</span></div>
   <div className="v33-task-last"><div className="v33-kanban-progress" title={`${t.progress}% progress`}><i style={{width:`${t.progress}%`}}/></div>{isOverdue(t)&&<small className="v33-task-overdue">Overdue</small>}{isManager&&<GripVertical className="v33-drag-handle" size={15}/>}</div>
   <label className="v33-mobile-move"><MoveRight size={14}/><span>Action</span><select aria-label={`Move ${t.title} to status`} value="" onChange={e=>{if(e.target.value==='DETAIL')onOpen(t);else if(e.target.value)onMove(t,e.target.value);e.target.value=''}}><option value="">Choose action</option>{availableMoves(t).map(x=><option key={x.key} value={x.key}>{x.label}</option>)}<option value="DETAIL">Open task details</option></select></label>
  </article>):<p className="v33-kanban-empty">No tasks in this stage</p>}</div>
 </section>)}</div>
}