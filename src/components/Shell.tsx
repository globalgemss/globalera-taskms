import {useEffect,useState,type ReactNode} from 'react'
import {NavLink,useNavigate} from 'react-router-dom'
import {LayoutDashboard,ListTodo,Users,FolderKanban,CalendarClock,Megaphone,BarChart3,History,Settings,Bell,Menu,X,Plus,CheckCheck,ChevronDown,LogOut,UserRound,PanelLeftClose,Building2,CalendarDays,Repeat2,Timer} from 'lucide-react'
import {useQueryClient} from '@tanstack/react-query'
import {useAuth} from '../lib/auth'
import {useUnit} from '../lib/units'
import {useNotifications} from '../lib/data'
import {supabase,api} from '../lib/supabase'
import {initials,when} from '../lib/utils'
import {toast} from 'sonner'
const menu=[
 {url:'/dashboard',label:'Dashboard',icon:LayoutDashboard,roles:['admin','manager','staff']},
 {url:'/tasks',label:'My Tasks & Board',icon:ListTodo,roles:['admin','manager','staff']},
 {url:'/time',label:'Time Tracking',icon:Timer,roles:['admin','manager','staff']},
 {url:'/users',label:'Team & Users',icon:Users,roles:['admin']},
 {url:'/projects',label:'Projects',icon:FolderKanban,roles:['admin','manager','staff']},
 {url:'/units',label:'Business Units',icon:Building2,roles:['admin']},
 {url:'/calendar',label:'Calendar',icon:CalendarDays,roles:['admin','manager','staff']},
 {url:'/recurring',label:'Recurring Tasks',icon:Repeat2,roles:['admin','manager']},
 {url:'/followups',label:'Follow-ups',icon:CalendarClock,roles:['admin','manager','staff']},
 {url:'/notices',label:'Notice Center',icon:Megaphone,roles:['admin','manager','staff']},
 {url:'/reports',label:'Reports',icon:BarChart3,roles:['admin','manager']},
 {url:'/activity',label:'Activity Log',icon:History,roles:['admin']},
 {url:'/settings',label:'Settings',icon:Settings,roles:['admin','manager','staff']},
]
export function Shell({children}:{children:ReactNode}){
 const{profile}=useAuth(),navigate=useNavigate(),[mobile,setMobile]=useState(false),[collapsed,setCollapsed]=useState(false),[showBell,setShowBell]=useState(false),query=useQueryClient(),{data:notifications=[]}=useNotifications()
 const {units,unitId,setUnitId}=useUnit()
 const role=profile?.role||'staff',items=menu.filter(m=>m.roles.includes(role)),unread=notifications.filter(n=>!n.read_at)
 useEffect(()=>{setMobile(false)},[navigate])
 useEffect(()=>{
  const channel=supabase.channel(`taskms-${profile?.id}`).on('postgres_changes',{event:'*',schema:'public',table:'tasks'},()=>{void query.invalidateQueries({queryKey:['tasks']})})
   .on('postgres_changes',{event:'*',schema:'public',table:'task_timers'},()=>{void query.invalidateQueries({queryKey:['task_timers']})})
   .on('postgres_changes',{event:'*',schema:'public',table:'task_timer_events'},()=>{void query.invalidateQueries({queryKey:['timer-events']})})
   .on('postgres_changes',{event:'*',schema:'public',table:'notices'},()=>{void query.invalidateQueries({queryKey:['notices']})})
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:`user_id=eq.${profile?.id}`},()=>{void query.invalidateQueries({queryKey:['notifications']})}).subscribe()
  return()=>{void supabase.removeChannel(channel)}
 },[profile?.id,query])
 async function logout(){await supabase.auth.signOut();query.clear();navigate('/login',{replace:true})}
 async function mark(id:string){try{await api('mark_notification_read',{notification_id:id});void query.invalidateQueries({queryKey:['notifications']})}catch(e){toast.error((e as Error).message)}}
 return <div className={`app-shell ${collapsed?'shell-collapsed':''}`}>
  {mobile&&<button className="sidebar-scrim" aria-label="Close navigation" onClick={()=>setMobile(false)}/>}
  <aside className={`sidebar ${mobile?'sidebar-open':''}`}>
    <div className="sidebar-brand"><div className="brandmark">GE</div><div className="brand-title">GLOBAL ERA<span>TASK MANAGEMENT</span></div><button className="icon-button mobile-only" aria-label="Close menu" onClick={()=>setMobile(false)}><X size={21}/></button></div>
    <div className="sidebar-scroll"><p className="nav-heading">WORKSPACE</p>{items.slice(0,2).map(m=><NavLink onClick={()=>setMobile(false)} key={m.url} to={m.url} className={({isActive})=>`nav-item ${isActive?'nav-active':''}`}><m.icon size={19}/><span>{m.label}</span></NavLink>)}<p className="nav-heading nav-spaced">MANAGEMENT</p>{items.slice(2).map(m=><NavLink onClick={()=>setMobile(false)} key={m.url} to={m.url} className={({isActive})=>`nav-item ${isActive?'nav-active':''}`}><m.icon size={19}/><span>{m.label}</span></NavLink>)}</div>
    <div className="sidebar-bottom"><div className="sidebar-status"><span className="pulse"/> Connected workspace</div><button onClick={()=>void logout()} className="nav-item sidebar-logout"><LogOut size={19}/><span>Sign out</span></button><div className="sidebar-account"><div className="avatar">{initials(profile?.full_name||'User')}</div><div className="sidebar-user"><b>{profile?.full_name}</b><span>{role.charAt(0).toUpperCase()+role.slice(1)} · {profile?.user_code}</span></div><ChevronDown size={16}/></div></div>
  </aside>
  <div className="app-main"><header className="topbar"><div className="topbar-start"><button className="icon-button mobile-only" aria-label="Open menu" onClick={()=>setMobile(true)}><Menu size={22}/></button><button className="icon-button desktop-only collapse-button" aria-label="Toggle sidebar" onClick={()=>setCollapsed(!collapsed)}><PanelLeftClose size={20}/></button><div className="crumb">WORKSPACE <span>/</span> <strong>Global Era TaskMS</strong></div></div><div className="topbar-end"><select className="unit-switcher" aria-label="Select business unit" value={unitId} onChange={e=>{setUnitId(e.target.value);navigate('/dashboard')}}>{profile?.role==='admin'&&<option value="">All Business Units</option>}{units.map(unit=><option key={unit.id} value={unit.id}>{unit.name}</option>)}</select><span className="topbar-today">{new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</span><div className="notification-wrap"><button className="icon-button bell-button" aria-label={`Notifications${unread.length?' '+unread.length+' unread':''}`} onClick={()=>setShowBell(!showBell)}><Bell size={20}/>{unread.length>0&&<i>{unread.length}</i>}</button>{showBell&&<><button className="bell-outside" aria-label="Close notifications" onClick={()=>setShowBell(false)}/><div className="notification-popover"><div className="notif-heading"><b>Notifications</b><span>{unread.length} unread</span></div>{notifications.slice(0,7).length?notifications.slice(0,7).map(n=><button className={`notification-item ${n.read_at?'':'unread'}`} key={n.id} onClick={()=>{void mark(n.id);setShowBell(false);if(n.task_id)navigate(`/tasks/${n.task_id}`)}}><strong>{n.title}</strong><span>{n.body}</span><small>{when(n.created_at)}</small></button>):<p className="notif-empty">You are all caught up.</p>}</div></>}</div><div className="top-avatar">{initials(profile?.full_name||'U')}</div></div></header><main className="main-content">{children}</main></div>
  <nav className="bottom-nav" aria-label="Mobile navigation"><NavLink to="/dashboard"><LayoutDashboard size={20}/><span>Home</span></NavLink><NavLink to="/tasks"><ListTodo size={20}/><span>Tasks</span></NavLink>{role!=='staff'?<button aria-label="Create task" className="bottom-add" onClick={()=>navigate('/tasks?new=1')}><Plus size={23}/></button>:<NavLink to="/followups"><CalendarClock size={20}/><span>Follow-up</span></NavLink>}<NavLink to="/time"><Timer size={20}/><span>Timer</span></NavLink><NavLink to="/settings"><UserRound size={20}/><span>Profile</span></NavLink></nav>
 </div>
}