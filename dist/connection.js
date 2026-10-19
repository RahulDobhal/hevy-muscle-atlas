import {fetchHevy} from './hevy-client.js';
import {sessionRequest,fetchSession} from './session-client.js';
import {setupAuthPicker} from './auth-picker.js';
import {validateData,importCSV} from './data-engine.js';
let activeKey='',activeMethod='import',sessionMayExist=false;
const $=s=>document.querySelector(s);
function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open('training-local',1);r.onupgradeneeded=()=>r.result.createObjectStore('connection');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('Browser storage is unavailable.'));});}
async function access(mode,value){const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('connection',mode),s=tx.objectStore('connection');const r=mode==='readonly'?s.get('current'):value===null?s.delete('current'):s.put(value,'current');let result;r.onsuccess=()=>result=r.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(new Error('Could not save on this device.'));tx.onabort=()=>reject(new Error('Could not save on this device.'));});}finally{db.close();}}
export const hasConnectionKey=()=>activeMethod==='session'||!!activeKey;
export async function saveConnection(data,key=activeKey,method=key?'key':'import'){if(method!=='session'&&sessionMayExist){await sessionRequest({action:'logout'});sessionMayExist=false;}await access('readwrite',{data,key,method});activeKey=key;activeMethod=method;}
export async function disconnect(){if(sessionMayExist||activeMethod==='session')await sessionRequest({action:'logout'});await access('readwrite',null);activeKey='';localStorage.removeItem('muscle-atlas-data');location.reload();}
export async function syncConnection(progress){if(!hasConnectionKey())throw new Error('Sign in to Hevy to sync.');const next=activeMethod==='session'?await fetchSession(progress):await fetchHevy(activeKey,progress);await saveConnection(next,activeKey,activeMethod);return next;}
export async function readImport(file,templates){if(file.size>25e6)throw new Error('Choose an export smaller than 25 MB.');const raw=await file.text();const result=file.name.toLowerCase().endsWith('.csv')?{workouts:importCSV(raw,templates),templates,importedAt:new Date().toISOString()}:JSON.parse(raw);return validateData({workouts:result.workouts,templates:result.templates,importedAt:new Date().toISOString()});}
export async function connect(onShow=()=>{},force=false){
 if(!force)try{const saved=await access('readonly');if(saved?.data){validateData(saved.data);activeKey=saved.key||'';activeMethod=saved.method||(activeKey?'key':'import');sessionMayExist=activeMethod==='session';return saved.data;}}catch{}
 const gate=$('#connect-screen');gate.hidden=false;onShow();
 setupAuthPicker(gate);
 return new Promise(resolve=>{
  let busy=false,newSession=false;
  const message=$('#connect-status');
  function progress(text){message.textContent=text;}
  const cancel=$('#connect-cancel');cancel.hidden=!force;cancel.onclick=()=>{if(busy)return;gate.hidden=true;resolve(null);};
  message.textContent='';
  async function run(task,key,method=key?'key':'import'){if(busy)return;busy=true;gate.querySelectorAll('button').forEach(b=>b.disabled=true);message.classList.remove('error');try{const data=await task();await saveConnection(data,key,method);$('#hevy-key').value='';gate.hidden=true;resolve(data);}catch(e){if(newSession){newSession=false;activeMethod='import';activeKey='';try{const saved=await access('readonly');if(saved?.data)await access('readwrite',{data:saved.data,key:'',method:'import'});await sessionRequest({action:'logout'});sessionMayExist=false;}catch{}}message.classList.add('error');progress(e.message);}finally{busy=false;$('#hevy-password').value='';gate.querySelectorAll('button').forEach(b=>b.disabled=false);}}
  $('#hevy-login-form').onsubmit=e=>{e.preventDefault();const username=$('#hevy-username').value.trim(),password=$('#hevy-password').value;run(async()=>{progress('Signing in to Hevy…');await sessionRequest({action:'login',username,password});sessionMayExist=true;newSession=true;$('#hevy-password').value='';return fetchSession(progress);},'','session');};
  $('#copy-export-prompt').onclick=async()=>{const prompt='Using my connected Hevy app, export all available workouts and their exercise templates as a downloadable JSON file for Hevy Muscle Atlas. Use this shape: {"workouts":[{"id":"...","start_time":"ISO timestamp","exercises":[{"exercise_template_id":"...","title":"...","sets":[{"type":"normal","weight_kg":0,"reps":0,"duration_seconds":null,"distance_meters":null}]}]}],"templates":{"TEMPLATE_ID":{"id":"TEMPLATE_ID","title":"...","primary_muscle_group":"chest","secondary_muscle_groups":[],"thumbnail_url":null}}}. Fetch every page available. Resolve the actual muscle mappings through Hevy exercise lookup; do not guess. Preserve real set values and types. Exclude descriptions, personal notes, profile fields, credentials, and tokens. If your environment cannot generate downloadable files, say so rather than inventing a download link.';try{await navigator.clipboard.writeText(prompt);progress('Prompt copied. Use it with your connected Hevy app.');}catch{progress('Copy is unavailable in this browser. Export a Hevy CSV or dashboard JSON instead.');}};
  $('#connect-form').onsubmit=e=>{e.preventDefault();const key=$('#hevy-key').value.trim();run(()=>fetchHevy(key,progress),key);};
  $('#connect-import').onclick=()=>$('#connect-file').click();
  $('#connect-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;run(async()=>{progress('Reading export…');const templates=await(await fetch('./catalog.json')).json();return readImport(file,templates);},'');e.target.value='';};
 });
}
