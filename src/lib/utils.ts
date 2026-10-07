import {format, isValid, parseISO} from 'date-fns'
export const money=(n:number)=>new Intl.NumberFormat('en-NP').format(n)
export function dateLabel(v:string|null|undefined){if(!v)return '—';const d=parseISO(v);return isValid(d)?format(d,'MMM d, yyyy'):'—'}
export function when(v:string|null|undefined){if(!v)return '—';const d=parseISO(v);return isValid(d)?format(d,'MMM d, yyyy · h:mm a'):'—'}
export function initials(name:string){return name.split(' ').filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'U'}
export const isOverdue=(t:{due_date:string|null,status:string})=>Boolean(t.due_date && t.due_date < todayNP() && !['Completed','Cancelled'].includes(t.status))
export const priorities=['Low','Normal','High','Urgent']
export const statuses=['New','Assigned','In Progress','Waiting','On Hold','Review','Completed','Cancelled']
export function labelColor(value:string){const v=value.toLowerCase();if(['completed','active','approved'].includes(v))return 'green';if(['urgent','overdue','cancelled','suspended'].includes(v))return 'red';if(['high','waiting','on hold','review'].includes(v))return 'amber';if(['in progress','assigned','normal'].includes(v))return 'blue';return 'slate'}

export function todayNP(){return new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Kathmandu'})}
