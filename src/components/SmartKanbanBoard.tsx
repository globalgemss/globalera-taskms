import {useRef,useState,type DragEvent,type PointerEvent} from 'react'
import {CalendarClock,GripVertical,Timer,ArrowUpRight,MoveRight} from 'lucide-react'
import type {Task} from '../lib/types'
import {Badge} from './UI'
import {dateLabel,isOverdue} from '../lib/utils'
import {compactTime,liveSeconds,type TaskTimer} from '../lib/timers'
import {allowedKanbanMoves,canDropTask,type KanbanStage} from './kanbanRules'

type Column={label:string;key:KanbanStage;group:string;matches:(t:Task)=>boolean}
const columns:Column[]=[
 {label:'To Do',key:'Assigned',group:'todo',matches:t=>['New','Assigned','Waiting','On Hold'].includes(t.status)},
 {label:'In Progress',key:'In Progress',group:'progress',matches:t=>t.status==='In Progress'},
 {label:'In Review',key:'Review',group:'review',matches:t=>t.status==='Review'},
 {label:'Completed',key:'Completed',group:'done',matches:t=>t.status==='Completed'}
]

type TouchDrag={id:string;pointerId:number;startX:number;startY:number;active:boolean}
export function SmartKanbanBoard({tasks,timers,role,userId,disabled,onMove,onOpen}:{tasks:Task[];timers:TaskTimer[];role:string;userId?:string;disabled:boolean;onMove:(t:Task,column:KanbanStage)=>void;onOpen:(t:Task)=>void}){
 const [over,setOver]=useState<KanbanStage|null>(null)
 const [dragId,setDragId]=useState<string|null>(null)
 const [touchId,setTouchId]=useState<string|null>(null)
 const board=useRef<HTMLDivElement>(null)
 const touch=useRef<TouchDrag|null>(null)
 const sourceTask=tasks.find(t=>t.id===dragId||t.id===touchId)
 const allowed=sourceTask?allowedKanbanMoves(sourceTask,role,userId):[]
 function drop(event:DragEvent<HTMLElement>,key:KanbanStage){
  event.preventDefault();setOver(null)
  const id=event.dataTransfer.getData('text/task-id')||dragId
  setDragId(null)
  const task=tasks.find(t=>t.id===id)
  if(task&&!disabled&&canDropTask(task,key,role,userId))onMove(task,key)
 }
 function touchStart(e:PointerEvent<HTMLButtonElement>,task:Task){
  if(e.pointerType==='mouse'||disabled||!allowedKanbanMoves(task,role,userId).length)return
  e.preventDefault()
  e.currentTarget.setPointerCapture(e.pointerId)
  touch.current={id:task.id,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,active:false}
 }
 function touchMove(e:PointerEvent<HTMLButtonElement>){
  const v=touch.current
  if(!v||v.pointerId!==e.pointerId)return
  if(!v.active&&Math.hypot(e.clientX-v.startX,e.clientY-v.startY)<8)return
  if(!v.active){v.active=true;setTouchId(v.id)}
  const el=document.elementFromPoint(e.clientX,e.clientY)
  const key=(el?.closest<HTMLElement>('[data-kanban-stage]')?.dataset.kanbanStage||'') as KanbanStage
  const task=tasks.find(t=>t.id===v.id)
  setOver(task&&canDropTask(task,key,role,userId)?key:null)
  const b=board.current
  if(b){const rect=b.getBoundingClientRect();if(e.clientX>rect.right-38)b.scrollLeft+=20;else if(e.clientX<rect.left+38)b.scrollLeft-=20}
 }
 function touchEnd(e:PointerEvent<HTMLButtonElement>){
  const v=touch.current
  if(!v||v.pointerId!==e.pointerId)return
  touch.current=null;setTouchId(null);setOver(null)
  if(!v.active)return
  const el=document.elementFromPoint(e.clientX,e.clientY)
  const key=(el?.closest<HTMLElement>('[data-kanban-stage]')?.dataset.kanbanStage||'') as KanbanStage
  const task=tasks.find(t=>t.id===v.id)
  if(task&&!disabled&&canDropTask(task,key,role,userId))onMove(task,key)
 }
 return <div ref={board} className="v33-kanban" aria-label="Task Kanban Board">{columns.map(col=><section key={col.key} data-kanban-stage={col.key} className={`v33-kanban-col v33-col-${col.group} ${over===col.key?'v33-drag-over':''} ${allowed.includes(col.key)?'v33-valid-drop':''}`} aria-label={col.label}
   onDragEnter={e=>{if(sourceTask&&canDropTask(sourceTask,col.key,role,userId)){e.preventDefault();setOver(col.key)}}}
   onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setOver(null)}}
   onDragOver={e=>{if(sourceTask&&canDropTask(sourceTask,col.key,role,userId)){e.preventDefault();e.dataTransfer.dropEffect='move'}}}
   onDrop={e=>drop(e,col.key)}>
  <div className="v33-kanban-heading"><span className="v33-kanban-dot"/><h3>{col.label}</h3><span className="v33-kanban-count">{tasks.filter(col.matches).length}</span></div>
  <div className="v33-kanban-stack">{tasks.filter(col.matches).length?tasks.filter(col.matches).map(t=>{
   const moves=allowedKanbanMoves(t,role,userId),draggable=moves.length>0&&!disabled
   return <article key={t.id} className={`v33-kanban-task ${isOverdue(t)?'v33-overdue':''} ${touchId===t.id?'v33-touch-dragging':''}`} draggable={draggable}
    onDragStart={e=>{if(!draggable){e.preventDefault();return}setDragId(t.id);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/task-id',t.id)}}
    onDragEnd={()=>{setOver(null);setDragId(null)}}>
   <div className="v33-task-eyebrow"><span>{t.task_no}</span><Badge value={t.priority}/></div>
   <button className="v33-task-title" type="button" onClick={()=>onOpen(t)} title="Open task details">{t.title}<ArrowUpRight size={15}/></button>
   <small className="v33-task-project">{t.projects?.name||'General Task'}</small>
   <div className="v33-task-footer"><span><CalendarClock size={13}/>{dateLabel(t.due_date)}</span><span><Timer size={13}/>{compactTime(timers.filter(z=>z.task_id===t.id).reduce((a,z)=>a+liveSeconds(z),0))}</span></div>
   <div className="v33-task-last"><div className="v33-kanban-progress" title={`${t.progress}% progress`}><i style={{width:`${t.progress}%`}}/></div>{isOverdue(t)&&<small className="v33-task-overdue">Overdue</small>}{draggable&&<button type="button" className="v33-drag-handle" aria-label={`Drag ${t.title} to another status`} title="Hold and drag to another column" onPointerDown={e=>touchStart(e,t)} onPointerMove={touchMove} onPointerUp={touchEnd} onPointerCancel={()=>{touch.current=null;setTouchId(null);setOver(null)}}><GripVertical size={17}/></button>}</div>
   {draggable&&<label className="v33-mobile-move"><MoveRight size={14}/><span>Move to</span><select aria-label={`Move ${t.title} to status`} defaultValue="" disabled={disabled} onChange={e=>{const key=e.target.value as KanbanStage;if(moves.includes(key))onMove(t,key);e.target.value=''}}><option value="">Choose status</option>{columns.filter(x=>moves.includes(x.key)).map(x=><option key={x.key} value={x.key}>{x.label}</option>)}</select></label>}
  </article>}) : <p className="v33-kanban-empty">No tasks in this stage</p>}</div>
 </section>)}</div>
}