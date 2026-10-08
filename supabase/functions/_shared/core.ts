import {createClient} from 'npm:@supabase/supabase-js@2'

export const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'}
export function respond(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json'}})}
export function err(message:string,status=400){return respond({error:message},status)}
export function adminClient(){const url=Deno.env.get('SUPABASE_URL');const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key)throw Error('Supabase server environment missing');return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})}
export async function actor(req:Request){
 const auth=req.headers.get('Authorization')||''
 if(!auth.startsWith('Bearer '))throw Error('Unauthorized')
 const admin=adminClient()
 const {data:{user},error}=await admin.auth.getUser(auth.slice(7))
 if(error||!user)throw Error('Unauthorized')
 const {data:profile,error:pe}=await admin.from('profiles').select('*').eq('id',user.id).single()
 if(pe||!profile||profile.status!=='Active')throw Error('Account inactive or unauthorized')
  // Supabase validates the signed JWT above; compare its issuance with per-user revocation epoch.
  const jwtPart=auth.slice(7).split('.')[1]||''
  const normalized=jwtPart.replace(/-/g,'+').replace(/_/g,'/')
  let issuedAt=0
  try{issuedAt=Number(JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length/4)*4,'='))).iat)||0}catch{throw Error('Invalid authentication claims')}
  if(issuedAt<=Number(profile.token_valid_after||0))throw Error('Session has been revoked. Please sign in again')
 return {admin,user,profile}
}
export const sha256=async(s:string)=>toHex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))))
export const toHex=(arr:Uint8Array)=>Array.from(arr).map(x=>x.toString(16).padStart(2,'0')).join('')
export const randHex=(n:number)=>toHex(crypto.getRandomValues(new Uint8Array(n)))
export async function hmacLink(userId:string,nonce:string){
 // Dedicated secret is preferred. The hosted Supabase service-role key is a stable
 // high-entropy server-only fallback, so staff creation works on fresh projects.
 // If the key rotates, regenerate staff QR links, or configure ACCESS_LINK_SECRET.
 const secret=Deno.env.get('ACCESS_LINK_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
 if(!secret||secret.length<32)throw Error('Server access secret is unavailable. Contact your administrator.')
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign'])
 return toHex(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${userId}:${nonce}`))))
}
export async function hashPin(pin:string,salt:string){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits'])
 const out=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:310000,hash:'SHA-256'},key,256)
 return toHex(new Uint8Array(out))
}
export const isPin=(v:unknown)=>typeof v==='string'&&/^\d{4}$/.test(v)
export async function timeline(admin:ReturnType<typeof adminClient>,taskId:string,actorId:string,entryType:string,description:string,visibility='Team'){
 const {error}=await admin.from('task_timeline').insert({task_id:taskId,actor_id:actorId,entry_type:entryType,description,visibility});if(error)throw Error(error.message)
}
export async function audit(admin:ReturnType<typeof adminClient>,actorId:string,action:string,entityType:string,entityId:string|null,details:Record<string,unknown>={}){
 await admin.from('audit_logs').insert({actor_id:actorId,action,entity_type:entityType,entity_id:entityId,details})
}
export function requireAdmin(role:string){if(role!=='admin')throw Error('Admin access required')}
export function requireManager(role:string){if(!['admin','manager'].includes(role))throw Error('Manager or Admin access required')}
export async function isTaskAccessible(admin:ReturnType<typeof adminClient>,actorProfile:{id:string,role:string},taskId:string,write=false){
 const {data:task,error}=await admin.from('tasks').select('id,title,status,progress,created_by,supervisor_id,unit_id').eq('id',taskId).maybeSingle()
 if(error||!task)throw Error('Task not found')
 if(actorProfile.role==='admin')return task
 const {data:member}=await admin.from('unit_memberships').select('role').eq('unit_id',task.unit_id).eq('user_id',actorProfile.id).eq('status','Active').maybeSingle()
 if(!member)throw Error('Not a member of this business unit')
 if(['unit_admin','manager'].includes(member.role)||task.created_by===actorProfile.id||task.supervisor_id===actorProfile.id)return task
 const {data:assigned}=await admin.from('task_assignees').select('user_id').eq('task_id',taskId)
 if((assigned||[]).some(x=>x.user_id===actorProfile.id)){
  if(write&&actorProfile.role==='manager')return task
  return task
 }
 throw Error('Not permitted to access this task')
}
export function text(v:unknown,max=500){return String(v??'').trim().slice(0,max)}
export async function notification(admin:ReturnType<typeof adminClient>,userIds:string[],title:string,body:string,taskId?:string){
 const ids=[...new Set(userIds)].filter(Boolean)
 if(!ids.length)return
 await admin.from('notifications').insert(ids.map(user_id=>({user_id,title,body,kind:'task',task_id:taskId||null})))
}