import {validateData} from './data-engine.js';
const API='https://api.hevyapp.com/v1/';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
export async function fetchHevy(key,onProgress=()=>{},fetcher=fetch){
 if(!key.trim())throw new Error('Enter your Hevy API key.');
 async function page(path){
  for(let attempt=0;attempt<3;attempt++){
   let response;try{response=await fetcher(API+path,{headers:{'api-key':key.trim()},credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(30000)});}catch{throw new Error('Could not reach Hevy. Check your connection and try again.');}
   if(response.status===401||response.status===403)throw new Error('Hevy rejected this key. Check your key and Hevy Pro access.');
   if(response.status===429&&attempt<2){onProgress('Hevy is busy. Retrying…');await delay(Math.min(30,Number(response.headers.get('Retry-After'))||3)*1000);continue;}
   if(!response.ok)throw new Error('Hevy could not finish syncing. Try again shortly.');
   return response.json();
  }
 }
 async function collect(path,field,size){const rows=[];let pages=1;for(let n=1;n<=pages;n++){onProgress(`${field==='workouts'?'Workouts':'Exercises'} · ${n} / ${pages}`);const result=await page(`${path}?page=${n}&pageSize=${size}`);if(!Array.isArray(result[field])||!Number.isInteger(result.page_count)||result.page_count<0||result.page_count>10000)throw new Error('Unexpected response from Hevy.');pages=result.page_count;rows.push(...result[field]);}return rows;}
 const workouts=await collect('workouts','workouts',10);
 if(!workouts.length)throw new Error('No workouts yet. Log a workout in Hevy, then connect again.');
 const templates=await collect('exercise_templates','exercise_templates',100);
 // Keep only fields used by the dashboard; omit personal notes and descriptions.
 const clean={syncedAt:new Date().toISOString(),workouts:workouts.map(w=>({id:w.id,start_time:w.start_time,end_time:w.end_time,exercises:w.exercises.map(e=>({exercise_template_id:e.exercise_template_id,title:e.title,sets:e.sets.map(s=>({type:s.type,weight_kg:s.weight_kg,reps:s.reps,duration_seconds:s.duration_seconds,distance_meters:s.distance_meters}))}))})),templates:Object.fromEntries(templates.map(t=>[t.id,{id:t.id,title:t.title,type:t.type,primary_muscle_group:t.primary_muscle_group,secondary_muscle_groups:t.secondary_muscle_groups||[],equipment:t.equipment,thumbnail_url:t.thumbnail_url}]))};
 return validateData(clean);
}
