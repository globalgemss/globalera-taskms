import type {Task} from '../lib/types'

export type KanbanStage = 'Assigned'|'In Progress'|'Review'|'Completed'
export type KanbanRole = 'admin'|'manager'|'staff'|string

/** Only a staff member's own assigned tasks can be moved in their board. */
export function isKanbanTaskOwned(task:Task, userId:string|undefined):boolean {
  return Boolean(userId && task.task_assignees?.some(a=>a.user_id===userId))
}

/** The UI never grants final approval: Review -> Completed is a review action, not a drag transition. */
export function allowedKanbanMoves(task:Task,role:KanbanRole,userId:string|undefined):KanbanStage[]{
  if(['Completed','Cancelled'].includes(task.status))return []
  if(role==='staff'){
    if(!isKanbanTaskOwned(task,userId))return []
    if(['Assigned','Waiting','On Hold'].includes(task.status))return ['In Progress']
    if(task.status==='In Progress')return ['Review']
    return []
  }
  if(role==='admin'||role==='manager'){
    if(['Assigned','Waiting','On Hold'].includes(task.status))return ['In Progress']
    if(task.status==='In Progress')return ['Assigned','Review']
    if(task.status==='Review')return ['In Progress','Completed']
  }
  return []
}

export function canDropTask(task:Task,destination:KanbanStage,role:KanbanRole,userId:string|undefined):boolean {
  return allowedKanbanMoves(task,role,userId).includes(destination)
}