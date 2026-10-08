import {useState} from 'react'
import {Copy,Download,KeyRound,Link2,MoreHorizontal,Plus,Printer,RefreshCw,Shield,ExternalLink,LayoutList,LayoutGrid,UsersRound,Building2,CheckCircle2,AlertCircle} from 'lucide-react'
import {QRCodeSVG} from 'qrcode.react'
import {toast} from 'sonner'
import {useQuery,useQueryClient} from '@tanstack/react-query'
import {useProfiles,useDepartments,keys} from '../lib/data'
import {api,supabase} from '../lib/supabase'
import type {Profile} from '../lib/types'
import {Badge,Btn,Card,Empty,Field,Loader,PageTitle,SearchInput,Select,Surface,TextInput,TextArea} from '../components/UI'
import {dateLabel,initials} from '../lib/utils'

type UserForm={full_name:string,email:string,phone:string,alternate_phone:string,address:string,joining_date:string,designation:string,role:string,department_id:string,manager_id:string}
const blank=():UserForm=>({full_name:'',email:'',phone:'',alternate_phone:'',address:'',joining_date:'',designation:'',role:'staff',department_id:'',manager_id:''})
const isInternal=(email:string)=>email.endsWith('@example.invalid')
export default function Users(){
 const {data:users=[],isLoading,error}=useProfiles()
 const {data:departments=[]}=useDepartments()
 const query=useQueryClient()
 const [search,setSearch]=useState(''),[role,setRole]=useState('All'),[status,setStatus]=useState('All'),[view,setView]=useState<'cards'|'table'>('cards')
 const [addOpen,setAddOpen]=useState(false),[form,setForm]=useState<UserForm>(blank()),[busy,setBusy]=useState(false),[formError,setFormError]=useState('')
 const [departmentName,setDepartmentName]=useState(''),[creatingDepartment,setCreatingDepartment]=useState(false),[newDepartment,setNewDepartment]=useState(false)
 const [details,setDetails]=useState<Profile|null>(null),[editOpen,setEditOpen]=useState(false)
 const [editUser,setEditUser]=useState({full_name:'',phone:'',alternate_phone:'',address:'',joining_date:'',designation:'',status:'Active',department_id:'',manager_id:''})
 const [qrToken,setQrToken]=useState(''),[qrName,setQrName]=useState(''),[qrCode,setQrCode]=useState(''),[qrOpen,setQrOpen]=useState(false)
 const [tempSecret,setTempSecret]=useState(''),[tempKind,setTempKind]=useState<'pin'|'password'>('pin')
 const [note,setNote]=useState(''),[notePrivacy,setNotePrivacy]=useState('User')
 const {data:userTimeline=[]}=useQuery({queryKey:['user-timeline',details?.id],enabled:!!details,queryFn:async()=>{const{data,error}=await supabase.from('user_timeline').select('*').eq('user_id',details!.id).order('created_at',{ascending:false}).limit(80);if(error)throw error;return data||[]}})
 const filtered=users.filter(u=>(role==='All'||u.role===role)&&(status==='All'||u.status===status)&&[u.full_name,u.user_code,u.email,u.phone||'',u.designation||''].join(' ').toLowerCase().includes(search.toLowerCase()))
 const mutate=(name:keyof UserForm,value:string)=>setForm(f=>({...f,[name]:value}))
 function showQR(token:string,name:string,code:string){setQrToken(token);setQrName(name);setQrCode(code);setQrOpen(true)}
 function qrLink(token:string){return `${window.location.origin}/u/${token}`}
 function openAdd(){setForm(blank());setFormError('');setNewDepartment(false);setTempSecret('');setAddOpen(true)}
 async function create(e:React.FormEvent){
  e.preventDefault();if(busy)return
  setBusy(true);setFormError('')
  try{
   if(form.full_name.trim().length<2)throw Error('Full name must have at least 2 characters')
   if(form.role!=='staff'&&!form.email.trim())throw Error('Email is required for Admin and Manager')
   const response=await api<{user:Profile,link_token?:string,temporary_pin?:string,temporary_password?:string}>('create_user',form)
   toast.success(`${response.user.full_name} created successfully`)
   await query.invalidateQueries({queryKey:keys.profiles})
   setAddOpen(false);setForm(blank())
   if(response.temporary_pin){setTempKind('pin');setTempSecret(response.temporary_pin)}
   else if(response.temporary_password){setTempKind('password');setTempSecret(response.temporary_password)}
   if(response.link_token)showQR(response.link_token,response.user.full_name,response.user.user_code)
  }catch(err){const message=(err as Error).message;setFormError(message);toast.error(message)}finally{setBusy(false)}
 }
 async function addDepartment(){
  if(!departmentName.trim())return
  setCreatingDepartment(true)
  try{
   const r=await api<{department:{id:string,name:string}}>('create_department',{name:departmentName.trim()})
   await query.invalidateQueries({queryKey:keys.departments})
   setForm(f=>({...f,department_id:r.department.id}))
   setDepartmentName('');setNewDepartment(false);toast.success('Department created')
  }catch(e){toast.error((e as Error).message)}finally{setCreatingDepartment(false)}
 }
 async function action(name:string,user:Profile){
  if(busy)return
  if(name==='rotate_link'&&!window.confirm(`Generate a new QR for ${user.full_name}? The old QR will stop working.`))return
  if(name==='reset_pin'&&!window.confirm(`Reset PIN for ${user.full_name}?`))return
  if(name==='toggle'&&!window.confirm(`${user.status==='Active'?'Deactivate':'Activate'} ${user.full_name}?`))return
  setBusy(true)
  try{
   if(name==='get_link'||name==='rotate_link'){
    const r=await api<{link_token:string,temporary_pin?:string,restored?:boolean}>(name,{user_id:user.id})
    if(r.temporary_pin){setTempKind('pin');setTempSecret(r.temporary_pin);toast.success('QR access activated. Copy the temporary PIN once.')}
    showQR(r.link_token,user.full_name,user.user_code)
    if(name==='rotate_link')toast.success('New QR generated; old QR revoked')
   }
   if(name==='reset_pin'){
    const r=await api<{temporary_pin:string}>('reset_pin',{user_id:user.id})
    setTempSecret(r.temporary_pin);setTempKind('pin');toast.success('Temporary PIN generated')
   }
   if(name==='toggle'){
    const next=user.status==='Active'?'Inactive':'Active'
    await api('update_user',{user_id:user.id,status:next})
    toast.success(`User ${next.toLowerCase()}`)
    await query.invalidateQueries({queryKey:keys.profiles})
    setDetails(null)
   }
  }catch(e){toast.error((e as Error).message)}finally{setBusy(false)}
 }
 function editProfile(u:Profile){setEditUser({full_name:u.full_name,phone:u.phone||'',alternate_phone:u.alternate_phone||'',address:u.address||'',joining_date:u.joining_date||'',designation:u.designation||'',status:u.status,department_id:u.department_id||'',manager_id:u.manager_id||''});setEditOpen(true)}
 async function saveEdit(e:React.FormEvent){e.preventDefault();if(!details||busy)return;setBusy(true)
  try{await api('update_user',{user_id:details.id,...editUser});toast.success('Profile updated');await query.invalidateQueries({queryKey:keys.profiles});void query.invalidateQueries({queryKey:['user-timeline',details.id]});setDetails({...details,...editUser});setEditOpen(false)}
  catch(e){toast.error((e as Error).message)}finally{setBusy(false)}
 }
 async function saveNote(e:React.FormEvent){e.preventDefault();if(!details||!note.trim()||busy)return;setBusy(true)
  try{await api('add_user_note',{user_id:details.id,note,visibility:notePrivacy});toast.success('Note added');setNote('');void query.invalidateQueries({queryKey:['user-timeline',details.id]})}
  catch(e){toast.error((e as Error).message)}finally{setBusy(false)}
 }
 function copy(value:string){void navigator.clipboard.writeText(value).then(()=>toast.success('Copied')).catch(()=>toast.error('Copy failed'))}
 function downloadQR(){const svg=document.getElementById('taskms-qr') as SVGSVGElement|null;if(!svg)return;const xml=new XMLSerializer().serializeToString(svg),blob=new Blob([xml],{type:'image/svg+xml'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`taskms-${qrCode}.svg`;a.click();URL.revokeObjectURL(url)}
 return <div className="fade-in">
  <PageTitle title="Team & Users" description="Invite your team, manage profiles, secure access links and task assignments." action={<Btn onClick={openAdd}><Plus size={17}/> Add User</Btn>}/>
  <div className="team-onboard"><div className="team-onboard-symbol"><UsersRound size={27}/></div><div><h3>Manage your entire team here</h3><p>Add Staff without an email address, issue a personal QR + PIN, and assign their first task. Admin and Manager accounts use email and password.</p></div><Btn variant="secondary" onClick={openAdd}><Plus size={16}/> Add team member</Btn></div>
  <div className="task-summary"><Card><strong>{users.length}</strong><span>Total Users</span></Card><Card><strong>{users.filter(u=>u.status==='Active').length}</strong><span>Active Users</span></Card><Card><strong>{users.filter(u=>u.role==='manager').length}</strong><span>Managers</span></Card><Card><strong>{users.filter(u=>u.role==='staff').length}</strong><span>Staff Members</span></Card></div>
  <Card className="list-panel"><div className="list-toolbar"><SearchInput value={search} onChange={setSearch} placeholder="Search name, ID, phone or role…"/><Select aria-label="User role filter" value={role} onChange={e=>setRole(e.target.value)}><option value="All">All Roles</option><option value="admin">Admin</option><option value="manager">Manager</option><option value="staff">Staff</option></Select><Select aria-label="User status filter" value={status} onChange={e=>setStatus(e.target.value)}><option value="All">All Status</option><option value="Active">Active</option><option value="Inactive">Inactive</option><option value="Suspended">Suspended</option></Select><div className="view-switch"><button type="button" className={view==='cards'?'active':''} aria-label="Card view" onClick={()=>setView('cards')}><LayoutGrid size={16}/></button><button type="button" className={view==='table'?'active':''} aria-label="Table view" onClick={()=>setView('table')}><LayoutList size={16}/></button></div></div>
  {isLoading?<Loader/>:error?<div className="error-box">{(error as Error).message}</div>:!filtered.length?<Empty title={users.length?'No matching users':'No team members added yet'} description="Create a team member to start assigning tasks." action={<Btn onClick={openAdd}><Plus size={16}/> Add first user</Btn>}/>:view==='cards'?<div className="user-cards">{filtered.map(u=><button key={u.id} className="user-card" onClick={()=>setDetails(u)}><div className="user-card-top"><span className="avatar user-avatar">{initials(u.full_name)}</span><Badge value={u.status}/></div><h3>{u.full_name}</h3><p>{u.designation||u.role}</p><div className="user-card-meta"><span>{u.user_code}</span><span>{u.departments?.name||'General'}</span></div><div className="user-card-bottom"><span>{isInternal(u.email)?'QR + PIN access':u.email}</span><MoreHorizontal size={19}/></div></button>)}</div>:<div className="responsive-table"><table><thead><tr><th>Team Member</th><th>Role</th><th>Department</th><th>Status</th><th>Access</th><th/></tr></thead><tbody>{filtered.map(u=><tr className="click-row" key={u.id} tabIndex={0} onClick={()=>setDetails(u)} onKeyDown={e=>e.key==='Enter'&&setDetails(u)}><td><strong>{u.full_name}</strong><small>{u.user_code} · {u.phone||u.designation||''}</small></td><td>{u.role}</td><td>{u.departments?.name||'General'}</td><td><Badge value={u.status}/></td><td>{u.role==='staff'?'QR + PIN':'Email + Password'}</td><td><MoreHorizontal size={18}/></td></tr>)}</tbody></table></div>}<div className="table-bottom">Showing {filtered.length} of {users.length} team members</div></Card>
  <Surface title="Add Team Member" description="Set up secure access and a new staff profile in one step." open={addOpen} onOpenChange={v=>!busy&&setAddOpen(v)} footer={<><Btn variant="secondary" disabled={busy} onClick={()=>setAddOpen(false)}>Cancel</Btn><Btn loading={busy} disabled={busy} form="create-user" type="submit"><CheckCircle2 size={16}/> Create User</Btn></>}>
   <form id="create-user" className="form-stack" onSubmit={create}>
    <div className="add-user-method"><Shield size={21}/><div><b>{form.role==='staff'?'Staff · QR + 4-digit PIN':'Email + strong password'}</b><small>{form.role==='staff'?'Email optional. Generate a secure personal link and PIN instantly.':'A valid email is required; a one-time password is generated.'}</small></div></div>
    {formError&&<div className="error-box" role="alert"><AlertCircle size={17}/> {formError}</div>}
    <div className="form-grid"><Field label="Full name *"><TextInput required minLength={2} placeholder="Name of the team member" value={form.full_name} onChange={e=>mutate('full_name',e.target.value)}/></Field><Field label="Role *"><Select value={form.role} onChange={e=>mutate('role',e.target.value)}><option value="staff">Staff — QR + PIN</option><option value="manager">Manager — Email / Password</option><option value="admin">Admin — Email / Password</option></Select></Field><Field label={form.role==='staff'?'Email (optional)':'Email address *'} hint={form.role==='staff'?'Leave blank for QR-only staff account. An internal login identity is created automatically.':undefined}><TextInput type="email" required={form.role!=='staff'} placeholder="name@example.com" value={form.email} onChange={e=>mutate('email',e.target.value)}/></Field><Field label="Mobile number"><TextInput type="tel" placeholder="98XXXXXXXX" value={form.phone} onChange={e=>mutate('phone',e.target.value)}/></Field><Field label="Alternate number"><TextInput type="tel" value={form.alternate_phone} onChange={e=>mutate('alternate_phone',e.target.value)}/></Field><Field label="Designation"><TextInput placeholder="Trainer / Staff / Supervisor" value={form.designation} onChange={e=>mutate('designation',e.target.value)}/></Field><Field label="Joining date"><TextInput type="date" value={form.joining_date} onChange={e=>mutate('joining_date',e.target.value)}/></Field><Field label="Department"><Select value={form.department_id} onChange={e=>mutate('department_id',e.target.value)}><option value="">General</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</Select><button type="button" className="inline-action" onClick={()=>setNewDepartment(x=>!x)}><Building2 size={15}/> {newDepartment?'Cancel new department':'Create department'}</button></Field><Field label="Reporting Manager"><Select value={form.manager_id} onChange={e=>mutate('manager_id',e.target.value)}><option value="">Not assigned</option>{users.filter(u=>u.role==='manager'||u.role==='admin').map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}</Select></Field></div>
    {newDepartment&&<div className="department-create"><TextInput value={departmentName} onChange={e=>setDepartmentName(e.target.value)} placeholder="New department name"/><Btn type="button" variant="secondary" disabled={creatingDepartment||!departmentName.trim()} loading={creatingDepartment} onClick={()=>void addDepartment()}><Plus size={15}/> Save Department</Btn></div>}
    <Field label="Address"><TextArea rows={2} value={form.address} onChange={e=>mutate('address',e.target.value)} placeholder="Current address / location"/></Field>
   </form>
  </Surface>
  <Surface size="wide" title="User Profile" open={!!details} onOpenChange={v=>!v&&setDetails(null)}>{details&&<div><div className="profile-hero"><div className="avatar big-avatar">{initials(details.full_name)}</div><div><h2>{details.full_name}</h2><p>{details.user_code} · {details.designation||details.role}</p><Badge value={details.status}/></div></div><div className="profile-details"><div><small>Email / Access</small><b>{isInternal(details.email)?'QR-only staff':details.email}</b></div><div><small>Phone</small><b>{details.phone||'—'}</b></div><div><small>Alternate Phone</small><b>{details.alternate_phone||'—'}</b></div><div><small>Department</small><b>{details.departments?.name||'General'}</b></div><div><small>Joining date</small><b>{details.joining_date?dateLabel(details.joining_date):'—'}</b></div><div><small>Address</small><b>{details.address||'—'}</b></div></div><h3 className="subheading">Account Actions</h3><div className="action-grid"><Btn variant="secondary" onClick={()=>editProfile(details)}>Edit Profile</Btn>{details.role==='staff'&&<><Btn variant="secondary" onClick={()=>void action('get_link',details)} loading={busy}><Link2 size={16}/> QR / Link</Btn><Btn variant="secondary" onClick={()=>void action('reset_pin',details)} loading={busy}><KeyRound size={16}/> Reset PIN</Btn><Btn variant="secondary" onClick={()=>void action('rotate_link',details)} loading={busy}><RefreshCw size={16}/> Regenerate QR</Btn></>}<Btn variant="secondary" onClick={()=>void action('toggle',details)} loading={busy}><Shield size={16}/>{details.status==='Active'?'Deactivate':'Activate'}</Btn></div><div className="line-divider"/><h3 className="subheading">Profile Notes & Timeline</h3><form onSubmit={saveNote} className="user-note-form"><TextInput required value={note} placeholder="Add a profile note…" onChange={e=>setNote(e.target.value)}/><Select aria-label="Note visibility" value={notePrivacy} onChange={e=>setNotePrivacy(e.target.value)}><option value="User">User visible</option><option value="Admin">Admin only</option></Select><Btn loading={busy} type="submit">Add Note</Btn></form><div className="user-timeline">{userTimeline.map(x=><div key={x.id}><span className="tiny-timeline-dot"/><div><b>{x.entry_type}</b><p>{x.description}</p><small>{dateLabel(x.created_at)} · {x.visibility}</small></div></div>)}{!userTimeline.length&&<p className="muted">No timeline entries.</p>}</div></div>}</Surface>
  <Surface title="Edit User Profile" open={editOpen} onOpenChange={setEditOpen} footer={<><Btn variant="secondary" onClick={()=>setEditOpen(false)}>Cancel</Btn><Btn type="submit" form="edit-user-form" loading={busy}>Save Changes</Btn></>}><form id="edit-user-form" className="form-stack" onSubmit={saveEdit}><div className="form-grid"><Field label="Full Name"><TextInput required minLength={2} value={editUser.full_name} onChange={e=>setEditUser({...editUser,full_name:e.target.value})}/></Field><Field label="Phone"><TextInput type="tel" value={editUser.phone} onChange={e=>setEditUser({...editUser,phone:e.target.value})}/></Field><Field label="Alternate Phone"><TextInput type="tel" value={editUser.alternate_phone} onChange={e=>setEditUser({...editUser,alternate_phone:e.target.value})}/></Field><Field label="Designation"><TextInput value={editUser.designation} onChange={e=>setEditUser({...editUser,designation:e.target.value})}/></Field><Field label="Joining date"><TextInput type="date" value={editUser.joining_date} onChange={e=>setEditUser({...editUser,joining_date:e.target.value})}/></Field><Field label="Status"><Select value={editUser.status} onChange={e=>setEditUser({...editUser,status:e.target.value})}><option>Active</option><option>Inactive</option><option>Suspended</option></Select></Field><Field label="Department"><Select value={editUser.department_id} onChange={e=>setEditUser({...editUser,department_id:e.target.value})}><option value="">General</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field><Field label="Reporting Manager"><Select value={editUser.manager_id} onChange={e=>setEditUser({...editUser,manager_id:e.target.value})}><option value="">Not assigned</option>{users.filter(u=>u.id!==details?.id&&(u.role==='admin'||u.role==='manager')).map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}</Select></Field></div><Field label="Address"><TextArea rows={2} value={editUser.address} onChange={e=>setEditUser({...editUser,address:e.target.value})}/></Field></form></Surface>
  <Surface title="Staff Access QR" description="Scan this QR to open the personal dashboard. The PIN is separate." size="compact" open={qrOpen} onOpenChange={v=>{setQrOpen(v);if(!v){setTempSecret('');setQrToken('')}}}><div className="qr-print-area"><b>GLOBAL ERA TASKMS</b><h3>{qrName}</h3><p>{qrCode}</p><div className="qr-image">{qrToken&&<QRCodeSVG id="taskms-qr" value={qrLink(qrToken)} size={214} marginSize={2}/>}</div><small>Scan to access the Task Dashboard</small></div>{tempSecret&&tempKind==='pin'&&<div className="qr-private-pin"><small>Private temporary PIN — share separately, never print on the QR card</small><strong>{tempSecret}</strong><Btn variant="secondary" onClick={()=>copy(tempSecret)}><Copy size={15}/>Copy PIN</Btn></div>}<div className="qr-actions"><Btn variant="secondary" onClick={()=>copy(qrLink(qrToken))}><Copy size={16}/> Copy Link</Btn><Btn variant="secondary" onClick={downloadQR}><Download size={16}/> SVG</Btn><Btn variant="secondary" onClick={()=>window.print()}><Printer size={16}/> Print</Btn><Btn variant="secondary" onClick={()=>window.open(qrLink(qrToken),'_blank','noopener,noreferrer')}><ExternalLink size={16}/> Open</Btn></div></Surface>
  <Surface size="compact" title="Temporary credentials" open={Boolean(tempSecret)&&!qrOpen} onOpenChange={v=>!v&&setTempSecret('')}><div className="temporary-secret"><small>Copy this {tempKind} now. It will not be shown again.</small><strong>{tempSecret}</strong><Btn onClick={()=>copy(tempSecret)}><Copy size={16}/> Copy {tempKind==='pin'?'PIN':'Password'}</Btn></div></Surface>
 </div>
}