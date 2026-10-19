import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';

const COOKIE='__Host-atlas-session';
const AGE=30*24*60*60;
const API='https://api.hevyapp.com/';
const attempts=new Map();
class PublicError extends Error{constructor(status,message){super(message);this.status=status;}}

function secret(){const key=Buffer.from(process.env.HEVY_SESSION_SECRET||'','base64');if(key.length!==32)throw new PublicError(503,'Sign-in is not configured yet. Import your workouts instead.');return key;}
export function sealSession(value,key,now=Date.now()){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(COOKIE));
 const encrypted=Buffer.concat([cipher.update(JSON.stringify({...value,sessionExpires:now+AGE*1000}),'utf8'),cipher.final()]);
 const result=Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
 if(result.length>3800)throw new PublicError(502,'Hevy returned a session this browser cannot store.');return result;
}
export function openSession(value,key,now=Date.now()){
 try{
  if(typeof value!=='string'||value.length>3800)throw Error();
  const buffer=Buffer.from(value,'base64url'),decipher=createDecipheriv('aes-256-gcm',key,buffer.subarray(0,12));
  decipher.setAAD(Buffer.from(COOKIE));decipher.setAuthTag(buffer.subarray(12,28));
  const data=JSON.parse(Buffer.concat([decipher.update(buffer.subarray(28)),decipher.final()]).toString());
  if(!Number.isFinite(data.sessionExpires)||data.sessionExpires<=now)throw Error();
  for(const field of ['access_token','refresh_token','appKey','username','userId'])if(typeof data[field]!=='string'||!data[field])throw Error();
  return data;
 }catch{throw new PublicError(401,'Your Hevy session has expired. Sign in again.');}
}
function setSession(res,data){res.setHeader('Set-Cookie',`${COOKIE}=${sealSession(data,secret())}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${AGE}`);}
function readSession(req){const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='));return openSession(raw?.slice(COOKIE.length+1),secret());}
export function allowedOrigin(origin,deployment=process.env.VERCEL_URL){const production=process.env.PUBLIC_ORIGIN||'https://hevy-muscle-atlas.vercel.app';return origin===production||(!!deployment&&origin===`https://${deployment}`);}
function throttle(req){
 const now=Date.now();for(const [id,record] of attempts)if(record.until<now)attempts.delete(id);
 const id=createHash('sha256').update(String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown')).digest('hex');
 const record=attempts.get(id)||{count:0,until:now+15*60*1000};
 if(record.count>=5||attempts.size>1000)throw new PublicError(429,'Too many sign-in attempts. Try again in 15 minutes.');
 record.count++;attempts.set(id,record);
}
function credentials(body){
 if(typeof body.username!=='string'||!body.username.trim()||body.username.length>254||typeof body.password!=='string'||!body.password||body.password.length>256)throw new PublicError(400,'Enter your Hevy username or email and password.');
 return {username:body.username.trim(),password:body.password};
}

async function signIn(username,password){
 const [{default:chromium},{default:puppeteer}]=await Promise.all([import('@sparticuz/chromium'),import('puppeteer-core')]);
 let browser;
 try{
  // Each attempt owns a fresh browser. Use Hevy's ordinary page and its normal
  // sign-in flow; no stealth settings, CAPTCHA extraction or token services.
  browser=await puppeteer.launch({args:chromium.args,executablePath:await chromium.executablePath(),headless:'shell',timeout:25000});
  const page=await browser.newPage();page.setDefaultTimeout(15000);
  await page.goto('https://hevy.com/login',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForSelector('input[type="password"]');
  await page.type('input:not([type]),input[type="text"],input[type="email"]',username);
  await page.type('input[type="password"]',password);
  const responsePromise=page.waitForResponse(r=>r.url()===API+'login'&&r.request().method()==='POST',{timeout:30000}).catch(()=>null);
  await page.evaluate(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Login');if(!button)throw Error('Login unavailable');button.click();});
  const response=await responsePromise;
  if(!response)throw new PublicError(502,'Hevy sign-in could not finish. Try again later, or import your workouts.');
  if(response.status()===401)throw new PublicError(401,'Hevy did not accept that username or password. Use your Hevy password.');
  if(!response.ok())throw new PublicError(502,'Hevy could not complete this sign-in. You can import a workout export instead.');
  const tokens=await response.json(),appKey=response.request().headers()['x-api-key'];
  if(typeof tokens.access_token!=='string'||typeof tokens.refresh_token!=='string'||!appKey)throw new PublicError(502,'Hevy returned an unsupported sign-in response.');
  return {access_token:tokens.access_token,refresh_token:tokens.refresh_token,expires_at:tokens.expires_at,appKey};
 }catch(e){if(e instanceof PublicError)throw e;throw new PublicError(502,'Hevy sign-in could not finish. Try again later, or import a workout export.');}
 finally{if(browser){const timer=setTimeout(()=>browser.process()?.kill('SIGKILL'),5000);try{await browser.close();}catch{}finally{clearTimeout(timer);}}}
}

async function upstream(session,path,options={}){
 let response;
 try{response=await fetch(API+path,{...options,headers:{'Content-Type':'application/json','x-api-key':session.appKey,'Hevy-Platform':'web',Authorization:`Bearer ${session.access_token}`,...options.headers},redirect:'error',signal:AbortSignal.timeout(20000)});}
 catch{throw new PublicError(502,'Could not reach Hevy. Your saved workouts have not changed.');}
 if(response.status===401||response.status===403)throw new PublicError(401,'Hevy needs you to sign in again. Your saved workouts are still on this device.');
 if(response.status===429)throw new PublicError(429,'Hevy is receiving too many requests. Try syncing again shortly.');
 if(!response.ok)throw new PublicError(502,'Hevy could not finish syncing. Your saved workouts have not changed.');
 try{return await response.json();}catch{throw new PublicError(502,'Hevy returned an unreadable response.');}
}
async function refreshSession(session,res){
 if(new Date(session.expires_at).valueOf()>Date.now()+60000)return session;
 const tokens=await upstream(session,'auth/refresh_token',{method:'POST',headers:{'x-client-time':String(Date.now()/1000)},body:JSON.stringify({refresh_token:session.refresh_token})});
 if(typeof tokens.access_token!=='string'||typeof tokens.refresh_token!=='string')throw new PublicError(401,'Please sign in to Hevy again.');
 const next={...session,access_token:tokens.access_token,refresh_token:tokens.refresh_token,expires_at:tokens.expires_at};setSession(res,next);return next;
}
function timestamp(value){const date=new Date(typeof value==='number'?value*1000:value);if(!Number.isFinite(date.valueOf()))throw new PublicError(502,'Hevy returned an invalid workout date.');return date.toISOString();}
function number(value){if(value==null)return null;if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw new PublicError(502,'Hevy returned an invalid set.');return value;}
export function cleanWorkouts(rows){
 if(!Array.isArray(rows)||rows.length>20)throw new PublicError(502,'Hevy returned an unexpected workout page.');
 const templates=Object.create(null);
 const workouts=rows.map(w=>{
  if(typeof w.id!=='string'||!Array.isArray(w.exercises))throw new PublicError(502,'Hevy returned an incomplete workout.');
  return {id:w.id,start_time:timestamp(w.start_time),end_time:timestamp(w.end_time??w.start_time),exercises:w.exercises.map(e=>{
   if(typeof e.exercise_template_id!=='string'||typeof e.title!=='string'||typeof e.muscle_group!=='string'||!Array.isArray(e.sets))throw new PublicError(502,'Hevy returned an incomplete exercise.');
   const id=e.exercise_template_id;
   templates[id]={id,title:e.title,type:e.exercise_type,primary_muscle_group:e.muscle_group,secondary_muscle_groups:Array.isArray(e.other_muscles)?e.other_muscles:[],equipment:e.equipment_category,thumbnail_url:typeof e.thumbnail_url==='string'&&e.thumbnail_url.startsWith('https://')?e.thumbnail_url:null};
   return {exercise_template_id:id,title:e.title,sets:e.sets.map(s=>({type:['warmup','failure','dropset'].includes(s.indicator)?s.indicator:'normal',weight_kg:number(s.weight_kg),reps:number(s.reps),duration_seconds:number(s.duration_seconds),distance_meters:number(s.distance_meters)}))};
  })};
 });
 return {workouts,templates};
}

export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Origin, Cookie');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'POST required.'});}
 if(!allowedOrigin(req.headers.origin)||!String(req.headers['content-type']).startsWith('application/json'))return res.status(403).json({error:'Open the dashboard to connect.'});
 try{
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(!body||JSON.stringify(body).length>4096)throw new PublicError(400,'Invalid request.');
  if(body.action==='logout'){res.setHeader('Set-Cookie',`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);return res.json({ok:true});}
  if(body.action==='login'){
   secret();const {username,password}=credentials(body);throttle(req);
   const session=await signIn(username,password);
   const account=await upstream(session,'user/account');
   if(typeof account.username!=='string'||typeof account.id!=='string')throw new PublicError(502,'Could not verify your Hevy account.');
   setSession(res,{...session,username:account.username,userId:account.id});return res.json({username:account.username});
  }
  if(body.action!=='workouts')throw new PublicError(400,'Unknown request.');
  if(!Number.isInteger(body.offset)||body.offset<0||body.offset>50000)throw new PublicError(400,'Invalid workout page.');
  const session=await refreshSession(readSession(req),res);
  const params=new URLSearchParams({username:session.username,limit:'10',offset:String(body.offset)});
  const page=await upstream(session,'user_workouts_paged?'+params);
  const clean=cleanWorkouts(page.workouts);
  if(body.offset===0){const count=await upstream(session,'workout_count');if(!Number.isInteger(count.workout_count)||count.workout_count<0||count.workout_count>50000)throw new PublicError(502,'Could not verify the size of your history.');clean.total=count.workout_count;}
  return res.json(clean);
 }catch(e){return res.status(e instanceof PublicError?e.status:500).json({error:e instanceof PublicError?e.message:'Could not complete the connection. Please try again.'});}
}
