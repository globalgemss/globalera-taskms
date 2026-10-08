import {actor,audit,cors,err,hashPin,hmacLink,isPin,isTaskAccessible,notification,randHex,requireAdmin,requireManager,respond,sha256,text,timeline} from '../_shared/core.ts'

const actions=['create_user','update_user','add_user_note','get_link','rotate_link','reset_pin','change_pin','create_task','update_task','assign_task','update_progress','change_status','add_note','add_followup','review_task','create_notice','toggle_notice','read_notice','complete_followup','create_project','create_department','mark_notification_read','create_unit','update_unit','set_unit_member','add_checklist','toggle_checklist','add_evidence','create_milestone','complete_milestone','create_recurring_rule','run_recurring_rules','toggle_recurring_rule','timer_transition','verify_task_time']
const transitions:Record<string,string[]>={
 New:['Assigned','Cancelled'],Assigned:['In Progress','On Hold','Cancelled'],
 'In Progress':['Waiting','On Hold','Review','Cancelled'],Waiting:['In Progress','On Hold','Cancelled'],
 'On Hold':['In Progress','Cancelled'],Review:['In Progress','Completed'],Completed:['In Progress'],Cancelled:[]
}

Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
 if(req.method!=='POST')return err('Method not allowed',405)
 try{
  const {admin,profile,user}=await actor(req)
  const body=await req.json()
  const action=String(body.action||'')
  if(!actions.includes(action))return err('Unknown action',400)
  const myId=user.id
  const adminOnly=()=>requireAdmin(profile.role)
  const managerOnly=()=>requireManager(profile.role)
  const task=async()=>isTaskAccessible(admin,profile,String(body.task_id||''),true)
  const trainingUnit=async()=>{const {data,error}=await admin.from('business_units').select('id').eq('code','TRAINING').single();if(error||!data)throw Error('Default unit missing');return data.id as string}
  const mustUnit=async(raw:unknown)=>{const id=String(raw||await trainingUnit());const {data:u}=await admin.from('business_units').select('id,status').eq('id',id).maybeSingle();if(!u||u.status!=='Active')throw Error('Business unit unavailable');return id}
  const membership=async(uid:string,unit:string)=>{const {data:m}=await admin.from('unit_memberships').select('role,status').eq('unit_id',unit).eq('user_id',uid).eq('status','Active').maybeSingle();return m}
  const canManage=async(unit:string)=>{if(profile.role==='admin')return;const m=await membership(myId,unit);if(!m||!['manager','unit_admin'].includes(m.role))throw Error('Manager access required for this business unit')}
  const canView=async(unit:string)=>{if(profile.role==='admin')return;if(!await membership(myId,unit))throw Error('No access to this business unit')}
  const taskManager=async()=>{const t=await task();await canManage(t.unit_id);return t}
  const requireUnitUser=async(uid:unknown,unit:string)=>{if(!uid)return null;const id=String(uid);const {data:possibleAdmin}=await admin.from('profiles').select('role,status').eq('id',id).maybeSingle();if(possibleAdmin?.role==='admin'&&possibleAdmin.status==='Active')return id;const {data:m}=await admin.from('unit_memberships').select('user_id').eq('user_id',id).eq('unit_id',unit).eq('status','Active').maybeSingle();if(!m)throw Error('Selected user does not belong to this business unit');return id}
  const requireUnitDepartment=async(dep:unknown,unit:string)=>{if(!dep)return null;const {data:d}=await admin.from('departments').select('id').eq('id',dep).eq('unit_id',unit).maybeSingle();if(!d)throw Error('Department does not belong to selected unit');return d.id}
  const validateProject=async(pid:unknown,unit:string)=>{if(!pid)return null;const {data}=await admin.from('projects').select('id,unit_id').eq('id',pid).maybeSingle();if(!data||data.unit_id!==unit)throw Error('Project does not belong to selected business unit');return data.id}

  const checkAssignees=async(ids:string[],unit:string)=>{
   if(!ids.length)throw Error('Select at least one assignee')
   const unique=[...new Set(ids)]
   const {data, error}=await admin.from('profiles').select('id,status,manager_id').in('id',unique)
   if(error||!data||data.length!==unique.length||data.some(u=>u.status!=='Active'))throw Error('An assignee is invalid or inactive')
   const {data:members,error:membersError}=await admin.from('unit_memberships').select('user_id').eq('unit_id',unit).eq('status','Active').in('user_id',unique)
   if(membersError||!members||members.length!==unique.length)throw Error('All assignees must belong to the selected business unit')
   if(profile.role==='manager'&&data.some(u=>u.manager_id!==myId&&u.id!==myId))throw Error('You may assign only your own team')
   return unique
  }
  switch(action){
   case 'create_user':{
    adminOnly()
    const full_name=text(body.full_name,120),role=text(body.role,20)
    const providedEmail=text(body.email,254).toLowerCase()
    // Staff login is always QR + PIN. A non-deliverable internal Auth identity
    // is generated when an email address was not supplied, never mailed to.
    const email=providedEmail || (role==='staff'?`staff-${randHex(12)}@example.invalid`:'')
    if(full_name.length<2||!['staff','manager','admin'].includes(role))throw Error('Valid name and role required')
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('A valid email is required for Admin and Manager')
    const phone=text(body.phone,30),alternate_phone=text(body.alternate_phone,30)
    if(phone&&!/^[+\d()\-\s]{7,22}$/.test(phone))throw Error('Enter a valid phone number')
    // Each staff has an internal Auth identity so their RLS policies work correctly.
    const unitId=await mustUnit(body.unit_id)
    await requireUnitDepartment(body.department_id,unitId)
    await requireUnitUser(body.manager_id,unitId)
    const tempPassword=randHex(18)+'A!'
    const {data:created,error:ce}=await admin.auth.admin.createUser({email,password:tempPassword,email_confirm:true,user_metadata:{full_name}})
    if(ce||!created.user)throw Error(ce?.message||'Could not create auth account')
    const newId=created.user.id
    const {data:updated,error:ue}=await admin.from('profiles').update({full_name,email,role,phone:phone||null,alternate_phone:alternate_phone||null,address:text(body.address,500)||null,joining_date:body.joining_date||null,designation:text(body.designation,80)||null,department_id:body.department_id||null,manager_id:body.manager_id||null}).eq('id',newId).select('id,user_code,full_name,email,role').single()
    if(ue){await admin.auth.admin.deleteUser(newId);throw Error(ue.message)}
    const {error:membershipError}=await admin.from('unit_memberships').insert({user_id:newId,unit_id:unitId,role:role==='admin'?'unit_admin':role==='manager'?'manager':'staff'})
    if(membershipError){await admin.auth.admin.deleteUser(newId);throw Error('Unit membership failed: '+membershipError.message)}
    let access:Record<string,unknown>={}
    if(role==='staff'){
     try{
      const pin=String(1000+(crypto.getRandomValues(new Uint32Array(1))[0]%9000))
      const nonce=randHex(24),token=await hmacLink(newId,nonce),salt=randHex(18)
      const {error:le}=await admin.from('user_access_links').insert({user_id:newId,nonce,token_hash:await sha256(token),pin_salt:salt,pin_hash:await hashPin(pin,salt)})
      if(le)throw Error('QR access setup failed: '+le.message)
      access={temporary_pin:pin,link_token:token}
     }catch(e){await admin.auth.admin.deleteUser(newId);throw e}
    }else access={temporary_password:tempPassword}
    await admin.from('user_timeline').insert({user_id:newId,actor_id:myId,entry_type:'Account Created',description:`Account created with role ${role}`})
    await audit(admin,myId,'USER_CREATED','profile',newId,{role})
    return respond({user:updated,...access})
   }
   case 'update_user':{
    adminOnly()
    const id=String(body.user_id||'')
    const patch:Record<string,unknown>={}
    for(const key of ['full_name','phone','alternate_phone','address','joining_date','designation','department_id','manager_id','status','role'])if(Object.hasOwn(body,key))patch[key]=body[key]||null
    if(patch.full_name&&text(patch.full_name,120).length<2)throw Error('Full name must have at least 2 characters')
    if(patch.status&&!['Active','Inactive','Suspended'].includes(String(patch.status)))throw Error('Invalid user status')
    if(patch.role&&!['admin','manager','staff'].includes(String(patch.role)))throw Error('Invalid role')
    if(id===myId&&patch.status&&patch.status!=='Active')throw Error('Cannot deactivate yourself')
    if(id===myId&&patch.role&&patch.role!=='admin')throw Error('Cannot demote yourself')
    const {data,error}=await admin.from('profiles').update(patch).eq('id',id).select('id,full_name,status,role').single()
    if(error)throw Error(error.message)
    if(patch.status&&patch.status!=='Active'){await admin.from('user_access_links').update({is_active:false}).eq('user_id',id);await admin.from('profiles').update({token_valid_after:Math.floor(Date.now()/1000)}).eq('id',id)}
    if(patch.status==='Active')await admin.from('user_access_links').update({is_active:true}).eq('user_id',id)
    await admin.from('user_timeline').insert({user_id:id,actor_id:myId,entry_type:'Profile Updated',description:`Fields changed: ${Object.keys(patch).join(', ')}`})
    await audit(admin,myId,'USER_UPDATED','profile',id,{keys:Object.keys(patch)})
    return respond({user:data})
   }
   case 'add_user_note':{
    const id=String(body.user_id||''),value=text(body.note,2500)
    if(!value)throw Error('Note is required')
    if(profile.role!=='admin'&&id!==myId)throw Error('Cannot add notes to this profile')
    const visibility=body.visibility==='Admin'?'Admin':'User'
    if(visibility==='Admin'&&profile.role!=='admin')throw Error('Admin-only notes require Admin access')
    const {error}=await admin.from('user_timeline').insert({user_id:id,actor_id:myId,entry_type:'Note',description:value,visibility})
    if(error)throw Error(error.message)
    return respond({success:true})
   }
   case 'get_link':{
    adminOnly()
    const userId=String(body.user_id||'')
    const {data:profileTarget,error:pe}=await admin.from('profiles').select('role,status').eq('id',userId).maybeSingle()
    if(pe||!profileTarget||profileTarget.role!=='staff')throw Error('Only staff accounts support QR access')
    if(profileTarget.status!=='Active')throw Error('Activate the staff account before opening its QR link')
    const {data:link,error}=await admin.from('user_access_links').select('nonce,token_hash,is_active').eq('user_id',userId).maybeSingle()
    if(error)throw Error(error.message)
    if(!link){
     // Repair pre-existing orphaned staff accounts from the initial deployment.
     // The temporary PIN is returned once, never stored in plain text.
     const pin=String(1000+(crypto.getRandomValues(new Uint32Array(1))[0]%9000))
     const nonce=randHex(24),token=await hmacLink(userId,nonce),salt=randHex(18)
     const {error:createdError}=await admin.from('user_access_links').insert({user_id:userId,nonce,token_hash:await sha256(token),pin_salt:salt,pin_hash:await hashPin(pin,salt)})
     if(createdError)throw Error('Could not repair staff QR access: '+createdError.message)
     await admin.from('user_timeline').insert({user_id:userId,actor_id:myId,entry_type:'QR Access Activated',description:'Admin activated missing QR access and issued a new temporary PIN'})
     await audit(admin,myId,'STAFF_QR_ACTIVATED','profile',userId)
     return respond({link_token:token,temporary_pin:pin,restored:true})
    }
    if(!link.is_active)throw Error('QR access is inactive. Activate user first.')
    const token=await hmacLink(userId,link.nonce)
    if(await sha256(token)!==link.token_hash)throw Error('Access signing key has changed. Regenerate the QR link.')
    return respond({link_token:token})
   }
   case 'rotate_link':{
    adminOnly()
    const id=String(body.user_id||'')
    const {data:target}=await admin.from('profiles').select('role,status').eq('id',id).maybeSingle()
    if(target?.role!=='staff')throw Error('QR access is only for staff accounts')
    const nonce=randHex(24),token=await hmacLink(id,nonce)
    const {data:link,error}=await admin.from('user_access_links').update({nonce,token_hash:await sha256(token),is_active:target.status==='Active',failures:0,locked_until:null}).eq('user_id',id).select('id').maybeSingle()
    if(error||!link)throw Error(error?.message||'No staff access record found')
    // The per-user JWT cutoff immediately blocks prior access tokens in RLS and API guards.
    await admin.from('profiles').update({token_valid_after:Math.floor(Date.now()/1000)}).eq('id',id)
    await admin.from('user_timeline').insert({user_id:id,actor_id:myId,entry_type:'QR Regenerated',description:'A new secure access link was issued'})
    await audit(admin,myId,'QR_ROTATED','profile',id)
    return respond({link_token:token})
   }
   case 'reset_pin':{
    adminOnly()
    const id=String(body.user_id||'')
    const pin=String(1000+(crypto.getRandomValues(new Uint32Array(1))[0]%9000)),salt=randHex(18)
    const {data:link,error}=await admin.from('user_access_links').update({pin_hash:await hashPin(pin,salt),pin_salt:salt,failures:0,locked_until:null}).eq('user_id',id).select('id').maybeSingle()
    if(error||!link)throw Error(error?.message||'No staff access record found')
    await admin.from('profiles').update({token_valid_after:Math.floor(Date.now()/1000)}).eq('id',id)
    await admin.from('user_timeline').insert({user_id:id,actor_id:myId,entry_type:'PIN Reset',description:'Access PIN reset by administrator'})
    await audit(admin,myId,'PIN_RESET','profile',id)
    return respond({temporary_pin:pin})
   }
   case 'change_pin':{
    if(profile.role!=='staff')throw Error('PIN change is for QR staff users')
    if(!isPin(body.current_pin)||!isPin(body.new_pin)||body.current_pin===body.new_pin)throw Error('Supply current and different new 4-digit PINs')
    const {data:l}=await admin.from('user_access_links').select('pin_hash,pin_salt').eq('user_id',myId).single()
    if(!l||l.pin_hash!==await hashPin(body.current_pin,l.pin_salt))throw Error('Current PIN incorrect')
    const salt=randHex(18)
    const {error}=await admin.from('user_access_links').update({pin_hash:await hashPin(body.new_pin,salt),pin_salt:salt}).eq('user_id',myId)
    if(error)throw Error(error.message)
    await admin.from('profiles').update({token_valid_after:Math.floor(Date.now()/1000)}).eq('id',myId)
    await admin.from('user_timeline').insert({user_id:myId,actor_id:myId,entry_type:'PIN Changed',description:'User changed their access PIN'})
    await audit(admin,myId,'PIN_CHANGED','profile',myId)
    return respond({success:true})
   }
   case 'create_task':{
    managerOnly()
    const unitId=await mustUnit(body.unit_id);await canManage(unitId)
    const title=text(body.title,220),assignees=await checkAssignees(Array.isArray(body.assignees)?body.assignees:[],unitId)
    const projectId=await validateProject(body.project_id,unitId)
    await requireUnitUser(body.supervisor_id||myId,unitId)
    if(title.length<3)throw Error('Task title must be at least 3 characters')
    const priority=text(body.priority,20)||'Normal'
    if(!['Low','Normal','High','Urgent'].includes(priority))throw Error('Invalid priority')
    const insert={title,description:text(body.description,8000)||null,project_id:projectId,unit_id:unitId,priority,
      start_date:body.start_date||null,due_date:body.due_date||null,
      due_time:body.due_time||null,created_by:myId,supervisor_id:body.supervisor_id||myId,status:'Assigned',estimated_minutes:Math.max(0,Math.min(100000,Math.trunc(Number(body.estimated_minutes)||0)))}
    const requestId=String(body.client_request_id||'')
    if(!/^[a-f0-9-]{36}$/i.test(requestId))throw Error('Missing client request identifier')
    const {data:created,error:te}=await admin.from('tasks').insert({...insert,client_request_id:requestId}).select('id,task_no,title').single()
    if(te?.code==='23505'){const{data:existing}=await admin.from('tasks').select('id,task_no,title').eq('client_request_id',requestId).maybeSingle();if(existing)return respond({task:existing,duplicate:true})}
    if(te||!created)throw Error(te?.message||'Task insert failed')
    const {error:ae}=await admin.from('task_assignees').insert(assignees.map(user_id=>({task_id:created.id,user_id,assigned_by:myId})))
    if(ae){await admin.from('tasks').update({status:'Cancelled'}).eq('id',created.id);throw Error('Assignment failed: '+ae.message)}
    await timeline(admin,created.id,myId,'Task Created','Task created and assigned')
    await admin.from('user_timeline').insert(assignees.map(user_id=>({user_id,actor_id:myId,entry_type:'Task Assigned',description:`Assigned ${created.task_no}: ${title}`})))
    await notification(admin,assignees,'New Task Assigned',`${created.task_no} · ${title}`,created.id)
    await audit(admin,myId,'TASK_CREATED','task',created.id,{assignees})
    return respond({task:created})
   }
   case 'update_task':{
    const t=await taskManager()
    if(profile.role==='manager'&&t.created_by!==myId&&t.supervisor_id!==myId)throw Error('Only owner/supervisor may edit this task')
    const patch:Record<string,unknown>={}
    for(const key of ['title','description','priority','due_date','due_time','start_date','project_id','estimated_minutes'])if(Object.hasOwn(body,key))patch[key]=body[key]||null
    if(Object.hasOwn(patch,'project_id'))patch.project_id=await validateProject(patch.project_id,t.unit_id)
    if(patch.title && text(patch.title).length<3)throw Error('Title too short')
    if(patch.priority&&!['Low','Normal','High','Urgent'].includes(String(patch.priority)))throw Error('Invalid priority')
    if(t.status==='Completed'||t.status==='Cancelled')throw Error('Reopen task before editing')
    const {error}=await admin.from('tasks').update(patch).eq('id',t.id)
    if(error)throw Error(error.message)
    await timeline(admin,t.id,myId,'Task Updated',`Fields updated: ${Object.keys(patch).join(', ')}`)
    return respond({success:true})
   }
   case 'assign_task':{
    const t=await taskManager()
    if(profile.role==='manager'&&t.created_by!==myId&&t.supervisor_id!==myId)throw Error('Only owner/supervisor may reassign')
    if(['Completed','Cancelled'].includes(t.status))throw Error('Cannot assign a closed task')
    const ids=await checkAssignees(Array.isArray(body.assignees)?body.assignees:[],t.unit_id)
    const {data:prev}=await admin.from('task_assignees').select('user_id').eq('task_id',t.id)
    const old=(prev||[]).map(x=>x.user_id)
    const additions=ids.filter(id=>!old.includes(id)),removals=old.filter(id=>!ids.includes(id))
    if(additions.length){const {error}=await admin.from('task_assignees').insert(additions.map(user_id=>({task_id:t.id,user_id,assigned_by:myId})));if(error)throw Error(error.message)}
    if(removals.length){
      const {data:activeTimers,error:timersError}=await admin.from('task_timers').select('user_id,state').eq('task_id',t.id).in('user_id',removals).in('state',['running','paused'])
      if(timersError)throw Error(timersError.message)
      for(const running of activeTimers||[]){
        const {error:stopError}=await admin.rpc('taskms_timer_transition',{p_task_id:t.id,p_user_id:running.user_id,p_actor_id:myId,p_action:'stop',p_reason:'Unassigned by manager',p_request_id:crypto.randomUUID()})
        if(stopError)throw Error(stopError.message)
      }
      const {error}=await admin.from('task_assignees').delete().eq('task_id',t.id).in('user_id',removals);if(error)throw Error(error.message)
    }
    await timeline(admin,t.id,myId,'Reassigned',`Assignees updated (+${additions.length}, -${removals.length})`)
    if(additions.length)await admin.from('user_timeline').insert(additions.map(user_id=>({user_id,actor_id:myId,entry_type:'Task Assigned',description:`Assigned task ${t.title}`})))
    await notification(admin,additions,'New Task Assigned',t.title,t.id)
    return respond({success:true})
   }
   case 'update_progress':{
    const t=await task()
    if(['Completed','Cancelled','Review'].includes(t.status))throw Error('Progress cannot change in current task status')
    const value=Number(body.progress)
    if(!Number.isInteger(value)||value<0||value>100)throw Error('Progress must be 0–100')
    const currentMembership=await membership(myId,t.unit_id)
    const isManager=profile.role==='admin'||Boolean(currentMembership&&['unit_admin','manager'].includes(currentMembership.role))
    const {data:assigned}=await admin.from('task_assignees').select('user_id,progress').eq('task_id',t.id)
    if(!isManager&&!assigned?.some(x=>x.user_id===myId))throw Error('You are not assigned to this task')
    const assignee=String(body.assignee_id||myId)
    if(!isManager&&assignee!==myId)throw Error('You cannot update others’ progress')
    if(!assigned?.some(x=>x.user_id===assignee))throw Error('Not an assignee')
    const {error:pe}=await admin.from('task_assignees').update({progress:value}).eq('task_id',t.id).eq('user_id',assignee)
    if(pe)throw Error(pe.message)
    const progresses=(assigned||[]).map(x=>x.user_id===assignee?value:x.progress)
    const mean=Math.round(progresses.reduce((a,b)=>a+b,0)/Math.max(progresses.length,1))
    const {error:ue}=await admin.from('tasks').update({progress:mean,status:t.status==='Assigned'?'In Progress':t.status}).eq('id',t.id)
    if(ue)throw Error(ue.message)
    await timeline(admin,t.id,myId,'Progress Updated',`Progress updated to ${value}% (overall ${mean}%)`)
    return respond({progress:mean})
   }
   case 'timer_transition':{
    const t=await task()
    const act=String(body.timer_action||'')
    if(!['start','pause','resume','stop'].includes(act))throw Error('Invalid timer control')
    const target=String(body.user_id||myId)
    const m=await membership(myId,t.unit_id)
    const canControl=profile.role==='admin'||Boolean(m&&['manager','unit_admin'].includes(m.role))
    if(['start','stop'].includes(act)&&!canControl)throw Error('Admin or authorized manager must start/stop task timers')
    if(!canControl&&target!==myId)throw Error('Staff can only pause/resume their own task timer')
    if(!canControl&& !['pause','resume'].includes(act))throw Error('Timer action not permitted')
    const {data:assigned}=await admin.from('task_assignees').select('user_id').eq('task_id',t.id).eq('user_id',target).maybeSingle()
    if(!assigned)throw Error('Selected user is not assigned to the task')
    const reqId=String(body.request_id||'')
    if(!/^[a-f0-9-]{36}$/i.test(reqId))throw Error('Valid timer request identifier required')
    const reason=text(body.reason,500)
    if(act==='pause'&&!reason)throw Error('Pause reason required')
    const {data,error}=await admin.rpc('taskms_timer_transition',{
      p_task_id:t.id,p_user_id:target,p_actor_id:myId,p_action:act,p_reason:reason||null,p_request_id:reqId
    })
    if(error)throw Error(error.message)
    await audit(admin,myId,'TIMER_'+act.toUpperCase(),'task',t.id,{staff_id:target,reason})
    if(act==='start')await notification(admin,[target],'Work timer started',t.title,t.id)
    return respond({timer:data,success:true})
   }
   case 'verify_task_time':{
    const t=await taskManager()
    if(t.status!=='Review'&&t.status!=='Completed')throw Error('Time verification requires Review or Completed task')
    const staff=String(body.user_id||''),{data:timer}=await admin.from('task_timers').select('elapsed_seconds,state').eq('task_id',t.id).eq('user_id',staff).maybeSingle()
    if(!timer||timer.state!=='stopped')throw Error('Stopped staff timer not found')
    const seconds=Number(body.verified_seconds)
    if(!Number.isInteger(seconds)||seconds<0||seconds>315360000)throw Error('Invalid verified time')
    const remarks=text(body.remarks,1000)
    if(seconds!==timer.elapsed_seconds&&!remarks)throw Error('Time correction reason required')
    const {error}=await admin.from('task_time_reviews').insert({task_id:t.id,user_id:staff,reviewer_id:myId,logged_seconds:timer.elapsed_seconds,verified_seconds:seconds,remarks})
    if(error)throw Error(error.message)
    await timeline(admin,t.id,myId,'Time Verified',`Staff time verified: ${seconds}s. ${remarks}`)
    await audit(admin,myId,'TIME_VERIFIED','task',t.id,{staff,seconds,remarks})
    return respond({success:true})
   }
   case 'change_status':{
    const t=await task();const next=String(body.status||'')
    if(!transitions[t.status]?.includes(next))throw Error(`Invalid transition ${t.status} → ${next}`)
    if(next==='Completed'||t.status==='Completed'||next==='Cancelled')await canManage(t.unit_id)
    if(t.status==='Review'&&next==='Completed')throw Error('Use Review Approve action')
    if(t.status==='Review'&&next==='In Progress')await canManage(t.unit_id)
    if(next==='Review'){
      if(profile.role==='staff'){
        const {data:own}=await admin.from('task_assignees').select('user_id').eq('task_id',t.id).eq('user_id',myId).maybeSingle()
        if(!own)throw Error('Only assigned staff may submit for review')
      }
      const {error:se}=await admin.rpc('taskms_submit_for_review',{p_task_id:t.id,p_actor_id:myId})
      if(se)throw Error(se.message)
      return respond({success:true})
    }
    if(next==='In Progress'&&t.status==='Assigned')throw Error('Work must be started by an authorized manager using Start Timer')
    const {error}=await admin.from('tasks').update({status:next,completed_at:next==='Completed'?new Date().toISOString():null,completed_by:next==='Completed'?myId:null}).eq('id',t.id)
    if(error)throw Error(error.message)
    await timeline(admin,t.id,myId,'Status Changed',`${t.status} → ${next}`)
    return respond({success:true})
   }
   case 'add_note':{
    const t=await task(),content=text(body.body,4000),visibility=body.visibility==='Admin'?'Admin':'Team'
    if(content.length<1)throw Error('Note required')
    if(visibility==='Admin'&&profile.role!=='admin')throw Error('Only Admin may create private notes')
    const {error}=await admin.from('task_notes').insert({task_id:t.id,author_id:myId,body:content,visibility})
    if(error)throw Error(error.message)
    await timeline(admin,t.id,myId,'Note Added',content,visibility)
    return respond({success:true})
   }
   case 'add_followup':{
    const t=await task(),when=String(body.followup_at||'')
    if(!when||isNaN(Date.parse(when)))throw Error('Valid follow-up date/time required')
    const {error}=await admin.from('task_followups').insert({task_id:t.id,created_by:myId,followup_at:when,method:text(body.method,35)||'Call',remarks:text(body.remarks,1500),outcome:text(body.outcome,500)||null})
    if(error)throw Error(error.message)
    await timeline(admin,t.id,myId,'Follow-up Added',`Follow-up scheduled: ${when}`)
    return respond({success:true})
   }
   case 'review_task':{
    const t=await taskManager()
    if(t.status!=='Review')throw Error('Only a task in Review can be decided')
    const decision=String(body.decision||'')
    if(!['Approved','Returned'].includes(decision))throw Error('Invalid review decision')
    if(decision==='Returned'&&!text(body.remarks))throw Error('Correction remarks required')
    const next=decision==='Approved'?'Completed':'In Progress'
    const {error}=await admin.from('tasks').update({status:next,progress:decision==='Approved'?100:t.progress,completed_at:decision==='Approved'?new Date().toISOString():null,completed_by:decision==='Approved'?myId:null}).eq('id',t.id)
    if(error)throw Error(error.message)
    await admin.from('task_reviews').insert({task_id:t.id,reviewer_id:myId,decision,remarks:text(body.remarks,2000)})
    await timeline(admin,t.id,myId,decision==='Approved'?'Approved':'Returned for Correction',text(body.remarks,2000)||decision)
    const {data:assignees}=await admin.from('task_assignees').select('user_id').eq('task_id',t.id)
    if(decision==='Approved'&&assignees?.length)await admin.from('user_timeline').insert(assignees.map(a=>({user_id:a.user_id,actor_id:myId,entry_type:'Task Completed',description:`Completed ${t.title}`})))
    await notification(admin,(assignees||[]).map(a=>a.user_id),decision==='Approved'?'Task Approved':'Task Returned for Correction',t.title,t.id)
    return respond({success:true})
   }
   case 'create_notice':{
    adminOnly()
    const unitId=await mustUnit(body.unit_id);await canManage(unitId)
    const title=text(body.title,180),message=text(body.message,4000),target_type=String(body.target_type||'all')
    if(!title||!message)throw Error('Title and message required')
    if(!['all','user','department','manager_team'].includes(target_type))throw Error('Invalid target type')
    if(target_type==='user'&&!body.target_user_id||target_type==='department'&&!body.target_department_id||target_type==='manager_team'&&!body.target_manager_id)throw Error('Target selection is required')
    if(target_type==='user')await requireUnitUser(body.target_user_id,unitId)
    if(target_type==='manager_team')await requireUnitUser(body.target_manager_id,unitId)
    if(target_type==='department')await requireUnitDepartment(body.target_department_id,unitId)
    const {data,error}=await admin.from('notices').insert({unit_id:unitId,title,message,priority:body.priority||'Normal',target_type,target_user_id:target_type==='user'?body.target_user_id||null:null,target_department_id:target_type==='department'?body.target_department_id||null:null,target_manager_id:target_type==='manager_team'?body.target_manager_id||null:null,start_date:body.start_date||null,end_date:body.end_date||null,created_by:myId}).select('id').single()
    if(error)throw Error(error.message)
    await audit(admin,myId,'NOTICE_CREATED','notice',data.id)
    return respond({id:data.id})
   }
   case 'toggle_notice':{
    const {data:notice}=await admin.from('notices').select('unit_id').eq('id',body.notice_id).maybeSingle();if(!notice)throw Error('Notice not found');await canManage(notice.unit_id);const {error}=await admin.from('notices').update({is_active:Boolean(body.is_active)}).eq('id',body.notice_id)
    if(error)throw Error(error.message)
    return respond({success:true})
   }
   case 'read_notice':{
    const id=String(body.notice_id||'')
    // Verify target eligibility (never use service-role bypass without an explicit check).
    const {data:n}=await admin.from('notices').select('*').eq('id',id).maybeSingle()
    if(!n||!n.is_active||n.start_date&&n.start_date>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Kathmandu'})||n.end_date&&n.end_date<new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Kathmandu'}))throw Error('Notice unavailable')
    const allowed=n.target_type==='all'||n.target_type==='user'&&n.target_user_id===myId||n.target_type==='department'&&n.target_department_id===profile.department_id||n.target_type==='manager_team'&&(n.target_manager_id===profile.manager_id||n.target_manager_id===myId)||profile.role==='admin'
    await canView(n.unit_id)
    if(!allowed)throw Error('Not authorized to read notice')
    const {error}=await admin.from('notice_reads').upsert({notice_id:id,user_id:myId},{onConflict:'notice_id,user_id'})
    if(error)throw Error(error.message)
    return respond({success:true})
   }
   case 'complete_followup':{
    const followupId=String(body.followup_id||'')
    const {data:f}=await admin.from('task_followups').select('id,task_id,completed_at,created_by').eq('id',followupId).maybeSingle()
    if(!f)throw Error('Follow-up not found')
    await isTaskAccessible(admin,profile,f.task_id,true)
    if(f.completed_at)throw Error('Follow-up already completed')
    if(profile.role==='staff'&&f.created_by!==myId)throw Error('Only own follow-up can be completed')
    const {error}=await admin.from('task_followups').update({completed_at:new Date().toISOString(),outcome:text(body.outcome,500)||'Completed'}).eq('id',followupId).is('completed_at',null)
    if(error)throw Error(error.message)
    await timeline(admin,f.task_id,myId,'Follow-up Completed','Follow-up marked complete')
    return respond({success:true})
   }
   case 'create_project':{
    const unitId=await mustUnit(body.unit_id);await canManage(unitId)
    const name=text(body.name,180)
    if(name.length<3)throw Error('Project name too short')
    await requireUnitUser(profile.role==='admin'?body.manager_id||myId:myId,unitId)
    const {data,error}=await admin.from('projects').insert({name,unit_id:unitId,description:text(body.description,1500)||null,manager_id:profile.role==='admin'?body.manager_id||myId:myId}).select('id,project_no,name').single()
    if(error)throw Error(error.message)
    await audit(admin,myId,'PROJECT_CREATED','project',data.id)
    return respond({project:data})
   }
   case 'create_department':{
    const unitId=await mustUnit(body.unit_id);await canManage(unitId);const name=text(body.name,100)
    if(name.length<2)throw Error('Department name required')
    const {data,error}=await admin.from('departments').insert({name,unit_id:unitId}).select('id,name').single()
    if(error)throw Error(error.message)
    return respond({department:data})
   }
   case 'create_unit':{
    adminOnly();const name=text(body.name,160),code=text(body.code,40).toUpperCase().replace(/[^A-Z0-9_]/g,'_')
    if(name.length<3||code.length<2)throw Error('Unit name/code required')
    const {data,error}=await admin.from('business_units').insert({name,code,description:text(body.description,1000)||null,color:/^#[a-f0-9]{6}$/i.test(String(body.color))?body.color:'#2463eb'}).select('id,name,code').single()
    if(error)throw Error(error.message);await audit(admin,myId,'UNIT_CREATED','unit',data.id);return respond({unit:data})
   }
   case 'update_unit':{
    adminOnly();const unitId=String(body.unit_id||''),patch:Record<string,unknown>={}
    const {data:existingUnit}=await admin.from('business_units').select('id').eq('id',unitId).maybeSingle();if(!existingUnit)throw Error('Unit not found')
    for(const k of ['name','description','status','color'])if(Object.hasOwn(body,k))patch[k]=body[k]
    if(patch.status&&!['Active','Inactive'].includes(String(patch.status)))throw Error('Invalid unit status')
    const {error}=await admin.from('business_units').update(patch).eq('id',unitId)
    if(error)throw Error(error.message);await audit(admin,myId,'UNIT_UPDATED','unit',unitId);return respond({success:true})
   }
   case 'set_unit_member':{
    adminOnly();const unitId=await mustUnit(body.unit_id),uid=String(body.user_id||''),role=String(body.role||'staff'),active=body.status!=='Inactive'
    if(!['unit_admin','manager','staff','viewer'].includes(role))throw Error('Invalid unit role')
    const {data:target}=await admin.from('profiles').select('id,role').eq('id',uid).maybeSingle();if(!target)throw Error('User not found')
    if(['unit_admin','manager'].includes(role)&&target.role==='staff')throw Error('Set global profile role to Manager before granting management permissions')
    if(uid===myId&&!active)throw Error('Cannot deactivate your own unit membership')
    const {error}=await admin.from('unit_memberships').upsert({unit_id:unitId,user_id:uid,role,status:active?'Active':'Inactive'},{onConflict:'unit_id,user_id'})
    if(error)throw Error(error.message)
    await audit(admin,myId,'UNIT_MEMBERSHIP_UPDATED','profile',uid,{unit_id:unitId,role,active});return respond({success:true})
   }
   case 'add_checklist':{
    const t=await task(),label=text(body.label,400)
    if(label.length<2)throw Error('Checklist item required')
    const {data,error}=await admin.from('task_checklist').insert({task_id:t.id,label,created_by:myId}).select('id').single()
    if(error)throw Error(error.message);await timeline(admin,t.id,myId,'Checklist Added',label);return respond({id:data.id})
   }
   case 'toggle_checklist':{
    const t=await task(),id=String(body.item_id||''),done=Boolean(body.is_done)
    const {data,error}=await admin.from('task_checklist').update({is_done:done,done_by:done?myId:null,done_at:done?new Date().toISOString():null}).eq('id',id).eq('task_id',t.id).select('id').maybeSingle()
    if(error||!data)throw Error(error?.message||'Checklist item not found')
    await timeline(admin,t.id,myId,'Checklist Updated',done?'Item completed':'Item reopened');return respond({success:true})
   }
   case 'add_evidence':{
    const t=await task(),label=text(body.label,180),url=text(body.url,2000)
    if(!/^https:\/\/[^\s]+$/i.test(url)||!label)throw Error('Evidence requires label and HTTPS link')
    const {data,error}=await admin.from('task_evidence').insert({task_id:t.id,label,url,kind:'Link',created_by:myId}).select('id').single()
    if(error)throw Error(error.message);await timeline(admin,t.id,myId,'Evidence Added',label);return respond({id:data.id})
   }
   case 'create_milestone':{
    const {data:p}=await admin.from('projects').select('id,unit_id').eq('id',body.project_id).maybeSingle()
    if(!p)throw Error('Project not found');await canManage(p.unit_id)
    const title=text(body.title,180);if(title.length<3)throw Error('Milestone title required')
    const {data,error}=await admin.from('project_milestones').insert({project_id:p.id,title,due_date:body.due_date||null}).select('id').single()
    if(error)throw Error(error.message);return respond({id:data.id})
   }
   case 'complete_milestone':{
    const {data:m}=await admin.from('project_milestones').select('id,projects(unit_id)').eq('id',body.milestone_id).maybeSingle()
    if(!m)throw Error('Milestone not found');const unit=(m.projects as unknown as {unit_id:string}).unit_id;await canManage(unit)
    const {error}=await admin.from('project_milestones').update({is_done:Boolean(body.is_done)}).eq('id',m.id)
    if(error)throw Error(error.message);return respond({success:true})
   }
   case 'create_recurring_rule':{
    const unitId=await mustUnit(body.unit_id);await canManage(unitId)
    const title=text(body.title,180),frequency=text(body.frequency,20),next_run=String(body.next_run||'')
    if(title.length<3||!['Daily','Weekly','Monthly'].includes(frequency)||!/^\d{4}-\d{2}-\d{2}$/.test(next_run))throw Error('Valid recurring task title, frequency and first date required')
    const ids=await checkAssignees([String(body.assignee_id||'')],unitId)
    const {data,error}=await admin.from('recurring_rules').insert({unit_id:unitId,title,description:text(body.description,3000),priority:body.priority||'Normal',assignee_id:ids[0],frequency,next_run,created_by:myId}).select('id').single()
    if(error)throw Error(error.message);return respond({id:data.id})
   }
   case 'toggle_recurring_rule':{
    const id=String(body.rule_id||'')
    const {data:r}=await admin.from('recurring_rules').select('id,unit_id').eq('id',id).maybeSingle()
    if(!r)throw Error('Recurring rule not found');await canManage(r.unit_id)
    const {error}=await admin.from('recurring_rules').update({active:Boolean(body.active)}).eq('id',id)
    if(error)throw Error(error.message);return respond({success:true})
   }
   case 'run_recurring_rules':{
    adminOnly()
    const now=new Date(),today=now.toLocaleDateString('sv-SE',{timeZone:'Asia/Kathmandu'}),{data:rules,error:e}=await admin.from('recurring_rules').select('*').eq('active',true).lte('next_run',today).limit(50)
    if(e)throw Error(e.message)
    let created=0
    for(const rule of rules||[]){
     const date=rule.next_run
     const {error:lockError}=await admin.from('automation_runs').insert({rule_id:rule.id,run_date:date,status:'Pending'})
     if(lockError)continue // unique(rule_id,run_date) protects against double execution
     try{
      const {data:t,error:te}=await admin.from('tasks').insert({title:rule.title,description:rule.description,unit_id:rule.unit_id,priority:rule.priority,created_by:rule.created_by,supervisor_id:rule.created_by,status:'Assigned',due_date:date}).select('id,task_no').single()
      if(te||!t)throw Error(te?.message||'Task creation failed')
      const {error:ae}=await admin.from('task_assignees').insert({task_id:t.id,user_id:rule.assignee_id,assigned_by:myId})
      if(ae)throw Error(ae.message)
      await timeline(admin,t.id,myId,'Recurring Task Created',`From recurring rule ${rule.id}`)
      const d=new Date(date+'T12:00:00Z');if(rule.frequency==='Daily')d.setUTCDate(d.getUTCDate()+1);else if(rule.frequency==='Weekly')d.setUTCDate(d.getUTCDate()+7);else d.setUTCMonth(d.getUTCMonth()+1)
      await admin.from('recurring_rules').update({next_run:d.toISOString().slice(0,10),last_run:date}).eq('id',rule.id)
      await admin.from('automation_runs').update({status:'Created',task_id:t.id}).eq('rule_id',rule.id).eq('run_date',date)
      await notification(admin,[rule.assignee_id],'Recurring task assigned',rule.title,t.id);created++
     }catch(ex){await admin.from('automation_runs').update({status:'Error'}).eq('rule_id',rule.id).eq('run_date',date)}
    }
    return respond({created,checked:rules?.length||0})
   }
   case 'mark_notification_read':{
    const {error}=await admin.from('notifications').update({read_at:new Date().toISOString()}).eq('id',body.notification_id).eq('user_id',myId)
    if(error)throw Error(error.message)
    return respond({success:true})
   }
  }
  return err('Unknown action')
 }catch(e){
  const message=(e as Error)?.message||'Unexpected error'
  const status=message.includes('Unauthorized')||message.includes('inactive')?401:message.includes('access')||message.includes('permission')||message.includes('may assign')||message.includes('Only')?403:400
  return err(message,status)
 }
})