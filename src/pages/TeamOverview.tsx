import {useMemo,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {Users,Search,CheckCheck,Clock3} from 'lucide-react'
import {useAuth} from '../lib/auth'
import {useProfiles,useTasks} from '../lib/data'
import {Badge,Card,Empty,Loader,PageTitle} from '../components/UI'
export default function TeamOverview(){
 const {profile}=useAuth(),{data:people=[],isLoading}=useProfiles(),{data:tasks=[]}=useTasks(),[search,setSearch]=useState(''),nav=useNavigate()
 const team=useMemo(()=>people.filter(p=>p.manager_id===profile?.id&&p.id!==profile?.id&&[p.full_name,p.designation,p.user_code].join(' ').toLowerCase().includes(search.toLowerCase())),[people,profile?.id,search])
 return <div className="fade-in"><PageTitle title="My Team" description="Your direct reports and their current workload. User account controls are Admin only."/>
 <Card className="v33-team-summary"><Users size={22}/><div><strong>{team.length}</strong><span>Direct reports</span></div><div><strong>{team.reduce((n,p)=>n+tasks.filter(t=>t.task_assignees?.some(a=>a.user_id===p.id)&&t.status!=='Completed').length,0)}</strong><span>Open team tasks</span></div></Card>
 <label className="v33-search v33-team-search"><Search size={16}/><input placeholder="Search my team" aria-label="Search my team" value={search} onChange={e=>setSearch(e.target.value)}/></label>
 {isLoading?<Loader/>:team.length?<div className="v33-team-grid">{team.map(p=>{const own=tasks.filter(t=>t.task_assignees?.some(a=>a.user_id===p.id));return <Card key={p.id} className="v33-team-card"><div className="v33-team-top"><div className="avatar">{p.full_name.split(' ').slice(0,2).map(x=>x[0]).join('').toUpperCase()}</div><div><strong>{p.full_name}</strong><p>{p.designation||'Team Member'} · {p.user_code}</p></div></div><div className="v33-team-meta"><Badge value={p.status}/><span><CheckCheck size={14}/> {own.filter(t=>t.status==='Completed').length} completed</span><span><Clock3 size={14}/> {own.filter(t=>t.status!=='Completed').length} open</span></div><button className="btn btn-secondary" onClick={()=>nav('/tasks')}>View team tasks</button></Card>})}</div>:<Empty title="No direct reports found" description="Admin can assign a Reporting Manager in Team & Users."/>}
 </div>
}