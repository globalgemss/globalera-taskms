import {actor,audit,cors,err,hashPin,hmacLink,isPin,isTaskAccessible,notification,randHex,requireAdmin,requireManager,respond,sha256,text,timeline} from '../_shared/core.ts'

const actions=['create_user','update_user','add_user_note','get_link','rotate_link','reset_pin','change_pin','create_task','update_task','assign_task','update_progress','change_status','add_note','add_followup','review_task','create_notice','toggle_notice','read_notice','complete_followup','create_project','create_department','mark_notification_read']
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
  const checkAssignees=async(ids:string[])=>{
   if(!ids.length)throw Error('Select at least one assignee')
   const unique=[...new Set(ids)]
   const {data, error}=await admin.from('profiles').select('id,status,manager_id').in('id',unique)
   if(error||!data||data.length!==unique.length||data.some(u=>u.status!=='Active'))throw Error('An assignee is invalid or inactive')
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
    const tempPassword=randHex(18)+'A!'
    const {data:created,error:ce}=await admin.auth.admin.createUser({email,password:tempPassword,email_confirm:true,user_metadata:{full_name}})
    if(ce||!created.user)throw Error(ce?.message||'Could not create auth account')
    const newId=created.user.id
    const {data:updated,error:ue}=await admin.from('profiles').update({full_name,email,role,phone:phone||null,alternate_phone:alternate_phone||null,address:text(body.address,500)||null,joining_date:body.joining_date||null,designation:text(body.designation,80)||null,department_id:body.department_id||null,manager_id:body.manager_id||null}).eq('id',newId).select('id,user_code,full_name,email,role').single()
    if(ue){await admin.auth.admin.deleteUser(newId);throw Error(ue.message)}
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
    const title=text(body.title,220),assignees=await checkAssignees(Array.isArray(body.assignees)?body.assignees:[])
    if(title.length<3)throw Error('Task title must be at least 3 characters')
    const priority=text(body.priority,20)||'Normal'
    if(!['Low','Normal','High','Urgent'].includes(priority))throw Error('Invalid priority')
    const insert={title,description:text(body.description,8000)||null,project_id:body.project_id||null,priority,
      start_date:body.start_date||null,due_date:body.due_date||null,
      due_time:body.due_time||null,created_by:myId,supervisor_id:body.supervisor_id||myId,status:'Assigned'}
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
    managerOnly();const t=await task()
    if(profile.role==='manager'&&t.created_by!==myId&&t.supervisor_id!==myId)throw Error('Only owner/supervisor may edit this task')
    const patch:Record<string,unknown>={}
    for(const key of ['title','description','priority','due_date','due_time','start_date','project_id'])if(Object.hasOwn(body,key))patch[key]=body[key]||null
    if(patch.title && text(patch.title).length<3)throw Error('Title too short')
    if(patch.priority&&!['Low','Normal','High','Urgent'].includes(String(patch.priority)))throw Error('Invalid priority')
    if(t.status==='Completed'||t.status==='Cancelled')throw Error('Reopen task before editing')
    const {error}=await admin.from('tasks').update(patch).eq('id',t.id)
    if(error)throw Error(error.message)
    await timeline(admin,t.id,myId,'Task Updated',`Fields updated: ${Object.keys(patch).join(', ')}`)
    return respond({success:true})
   }
   case 'assign_task':{
    managerOnly();const t=await task()
    if(profile.role==='manager'&&t.created_by!==myId&&t.supervisor_id!==myId)throw Error('Only owner/supervisor may reassign')
    if(['Completed','Cancelled'].includes(t.status))throw Error('Cannot assign a closed task')
    const ids=await checkAssignees(Array.isArray(body.assignees)?body.assignees:[])
    const {data:prev}=await admin.from('task_assignees').select('user_id').eq('task_id',t.id)
    const old=(prev||[]).map(x=>x.user_id)
    const additions=ids.filter(id=>!old.includes(id)),removals=old.filter(id=>!ids.includes(id))
    if(additions.length){const {error}=await admin.from('task_assignees').insert(additions.map(user_id=>({task_id:t.id,user_id,assigned_by:myId})));if(error)throw Error(error.message)}
    if(removals.length){const {error}=await admin.from('task_assignees').delete().eq('task_id',t.id).in('user_id',removals);if(error)throw Error(error.message)}
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
    const isManager=['admin','manager'].includes(profile.role)
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
   case 'change_status':{
    const t=await task();const next=String(body.status||'')
    if(!transitions[t.status]?.includes(next))throw Error(`Invalid transition ${t.status} → ${next}`)
    if((next==='Completed'||t.status==='Completed'||next==='Cancelled')&&!['admin','manager'].includes(profile.role))throw Error('Manager approval required')
    if(t.status==='Review'&&next==='Completed')throw Error('Use Review Approve action')
    if(t.status==='Review'&&next==='In Progress'&&!['admin','manager'].includes(profile.role))throw Error('Manager must return task')
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
    managerOnly();const t=await task()
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
    const title=text(body.title,180),message=text(body.message,4000),target_type=String(body.target_type||'all')
    if(!title||!message)throw Error('Title and message required')
    if(!['all','user','department','manager_team'].includes(target_type))throw Error('Invalid target type')
    if(target_type==='user'&&!body.target_user_id||target_type==='department'&&!body.target_department_id||target_type==='manager_team'&&!body.target_manager_id)throw Error('Target selection is required')
    const {data,error}=await admin.from('notices').insert({title,message,priority:body.priority||'Normal',target_type,target_user_id:target_type==='user'?body.target_user_id||null:null,target_department_id:target_type==='department'?body.target_department_id||null:null,target_manager_id:target_type==='manager_team'?body.target_manager_id||null:null,start_date:body.start_date||null,end_date:body.end_date||null,created_by:myId}).select('id').single()
    if(error)throw Error(error.message)
    await audit(admin,myId,'NOTICE_CREATED','notice',data.id)
    return respond({id:data.id})
   }
   case 'toggle_notice':{
    adminOnly();const {error}=await admin.from('notices').update({is_active:Boolean(body.is_active)}).eq('id',body.notice_id)
    if(error)throw Error(error.message)
    return respond({success:true})
   }
   case 'read_notice':{
    const id=String(body.notice_id||'')
    // Verify target eligibility (never use service-role bypass without an explicit check).
    const {data:n}=await admin.from('notices').select('*').eq('id',id).maybeSingle()
    if(!n||!n.is_active||n.start_date&&n.start_date>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Kathmandu'})||n.end_date&&n.end_date<new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Kathmandu'}))throw Error('Notice unavailable')
    const allowed=n.target_type==='all'||n.target_type==='user'&&n.target_user_id===myId||n.target_type==='department'&&n.target_department_id===profile.department_id||n.target_type==='manager_team'&&(n.target_manager_id===profile.manager_id||n.target_manager_id===myId)||profile.role==='admin'
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
    managerOnly()
    const name=text(body.name,180)
    if(name.length<3)throw Error('Project name too short')
    const {data,error}=await admin.from('projects').insert({name,description:text(body.description,1500)||null,manager_id:profile.role==='admin'?body.manager_id||myId:myId}).select('id,project_no,name').single()
    if(error)throw Error(error.message)
    await audit(admin,myId,'PROJECT_CREATED','project',data.id)
    return respond({project:data})
   }
   case 'create_department':{
    adminOnly();const name=text(body.name,100)
    if(name.length<2)throw Error('Department name required')
    const {data,error}=await admin.from('departments').insert({name}).select('id,name').single()
    if(error)throw Error(error.message)
    return respond({department:data})
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