import {validateData} from './data-engine.js';
export async function sessionRequest(body,fetcher=fetch){
 let response;try{response=await fetcher('/api/hevy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(body.action==='login'?115000:45000)});}catch{throw new Error('Could not reach the connection service. Try again shortly.');}
 let result;try{result=await response.json();}catch{throw new Error('Sign-in is unavailable here. Open the hosted dashboard or import your workouts.');}
 if(!response.ok)throw new Error(result.error||'Hevy could not complete the connection.');return result;
}
export async function fetchSession(progress=()=>{},request=sessionRequest){
 const workouts=[],templates=Object.create(null),seen=new Set();let total=Infinity;
 while(workouts.length<total){
  const page=await request({action:'workouts',offset:workouts.length});
  if(!workouts.length){if(!Number.isInteger(page.total)||page.total<0||page.total>50000)throw new Error('Could not verify your workout history.');total=page.total;}
  if(!Array.isArray(page.workouts)||!page.templates||(!page.workouts.length&&workouts.length<total))throw new Error('Hevy returned an incomplete history. Try syncing again.');
  for(const workout of page.workouts){if(seen.has(workout.id))throw new Error('Your history changed during sync. Please try again.');seen.add(workout.id);workouts.push(workout);}
  Object.assign(templates,page.templates);progress(`Loading workouts · ${workouts.length} / ${total}`);
  if(workouts.length>total)throw new Error('Your history changed during sync. Please try again.');
 }
 if(!workouts.length)throw new Error('No workouts yet. Log a workout in Hevy, then connect again.');
 return validateData({syncedAt:new Date().toISOString(),workouts,templates});
}
