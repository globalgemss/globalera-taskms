import {adminClient,cors,err,hashPin,isPin,respond,sha256} from '../_shared/core.ts'

Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
 if(req.method!=='POST')return err('Method not allowed',405)
 try{
  const body=await req.json()
  const action=String(body.action||'')
  const token=String(body.token||'')
  if(!/^[a-f0-9]{64}$/.test(token))return err('Invalid access link',401)
  const admin=adminClient()
  const token_hash=await sha256(token)
  const {data:link,error}=await admin.from('user_access_links').select('*').eq('token_hash',token_hash).eq('is_active',true).maybeSingle()
  if(error||!link)return err('Invalid or revoked access link',401)
  const {data:user}=await admin.from('profiles').select('id,user_code,full_name,designation,role,status,email,token_valid_after').eq('id',link.user_id).maybeSingle()
  if(!user||user.status!=='Active'||user.role!=='staff')return err('User account unavailable',403)
  if(action==='identify')return respond({user:{full_name:user.full_name,user_code:user.user_code,designation:user.designation}})
  if(action!=='login')return err('Unsupported login action')
  if(link.locked_until && new Date(link.locked_until).getTime()>Date.now())return err('Too many attempts. Try again after 15 minutes.',429)
  if(link.locked_until && new Date(link.locked_until).getTime()<=Date.now()){await admin.from('user_access_links').update({failures:0,locked_until:null}).eq('id',link.id)}
  if(!isPin(body.pin))return err('Enter a valid 4-digit PIN',400)
  const supplied=await hashPin(body.pin,link.pin_salt)
  if(supplied!==link.pin_hash){
   const {data:attempt,error:ae}=await admin.rpc('record_staff_pin_failure',{p_link_id:link.id})
   if(ae)throw Error(ae.message)
   const count=Array.isArray(attempt)?attempt[0]?.attempts:0
   return err(count>=5?'Too many attempts. Login locked for 15 minutes.':'Incorrect PIN',count>=5?429:401)
  }
  // Successful login resets lock and revokes old refresh tokens where supported.
  await admin.from('user_access_links').update({failures:0,locked_until:null,last_used_at:new Date().toISOString()}).eq('id',link.id)
  // Ensure new Auth JWT is issued in a later second than any revocation cutoff.
  if(Number(user.token_valid_after||0)>=Math.floor(Date.now()/1000)){await new Promise(resolve=>setTimeout(resolve,1100))}
  const {data:magic,error:me}=await admin.auth.admin.generateLink({type:'magiclink',email:user.email})
  if(me||!magic?.properties?.hashed_token)throw Error('Could not initiate secure session')
  return respond({token_hash:magic.properties.hashed_token,type:'magiclink'})
 }catch(e){return err((e as Error).message||'Login error',500)}
})
