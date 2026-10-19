import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import handler,{sealSession,openSession,allowedOrigin,cleanWorkouts} from '../dist/api/hevy.js';
import {fetchSession,sessionRequest} from '../dist/session-client.js';

const session={access_token:'test-access',refresh_token:'test-refresh',appKey:'test-app',username:'test-person',userId:'test-user'};
test('session encryption rejects edits, wrong secrets, expiry and missing identity',()=>{
 const key=randomBytes(32),sealed=sealSession(session,key,0);
 assert.equal(openSession(sealed,key,100).username,session.username);
 assert.ok(!sealed.includes(session.access_token));
 const edited=Buffer.from(sealed,'base64url');edited[30]^=1;
 assert.throws(()=>openSession(edited.toString('base64url'),key,100),/expired/);
 assert.throws(()=>openSession(sealed,randomBytes(32),100),/expired/);
 assert.throws(()=>openSession(sealed,key,31*86400000),/expired/);
 assert.throws(()=>openSession(sealSession({...session,userId:null},key,0),key,100),/expired/);
 assert.notEqual(sealed,sealSession(session,key,0));
});
test('only the dashboard and the exact current deployment can use the endpoint',async()=>{
 assert.equal(allowedOrigin('https://hevy-muscle-atlas.vercel.app'),true);
 assert.equal(allowedOrigin('https://test-preview.vercel.app','test-preview.vercel.app'),true);
 for(const origin of [undefined,'null','https://attacker.test','https://hevy-muscle-atlas.vercel.app.attacker.test','http://hevy-muscle-atlas.vercel.app'])assert.equal(allowedOrigin(origin),false);
 const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
 const blocked=response();await handler({method:'POST',headers:{origin:'https://attacker.test','content-type':'application/json'},body:{action:'logout'}},blocked);assert.equal(blocked.code,403);assert.equal(blocked.headers['Set-Cookie'],undefined);
 const cleared=response();await handler({method:'POST',headers:{origin:'https://hevy-muscle-atlas.vercel.app','content-type':'application/json'},body:{action:'logout'}},cleared);assert.match(cleared.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Strict; Max-Age=0/);
 const unauth=response();await handler({method:'GET',headers:{}},unauth);assert.equal(unauth.code,405);
});
const rawWorkout=id=>({id,start_time:1780000000,end_time:1780003600,description:'PRIVATE',user:{email:'PRIVATE'},exercises:[{exercise_template_id:'press',title:'Bench press',muscle_group:'chest',other_muscles:['triceps'],equipment_category:'machine',exercise_type:'weight_reps',thumbnail_url:'https://example.com/exercise.jpg',notes:'PRIVATE',sets:['normal','warmup','failure','dropset'].map(indicator=>({indicator,weight_kg:20,reps:8,private_field:'PRIVATE'}))}]});
test('web workouts retain muscle mappings, set types and dates while omitting private fields',()=>{
 const cleaned=cleanWorkouts([rawWorkout('one')]);
 assert.equal(cleaned.workouts[0].start_time,new Date(1780000000*1000).toISOString());
 assert.deepEqual(cleaned.workouts[0].exercises[0].sets.map(s=>s.type),['normal','warmup','failure','dropset']);
 assert.equal(cleaned.templates.press.primary_muscle_group,'chest');
 assert.deepEqual(cleaned.templates.press.secondary_muscle_groups,['triceps']);
 assert.ok(!JSON.stringify(cleaned).includes('PRIVATE'));
 const broken=rawWorkout('bad');broken.exercises[0].sets[0].reps=-1;assert.throws(()=>cleanWorkouts([broken]),/invalid set/);
 assert.throws(()=>cleanWorkouts(null),/unexpected/);
});
test('session sync follows verified count and refuses partial or duplicate history',async()=>{
 const requests=[];const data=await fetchSession(()=>{},async body=>{requests.push(body);return {...cleanWorkouts([rawWorkout(body.offset?'two':'one')]),total:2};});
 assert.equal(data.workouts.length,2);assert.deepEqual(requests,[{action:'workouts',offset:0},{action:'workouts',offset:1}]);
 await assert.rejects(fetchSession(()=>{},async body=>body.offset?{workouts:[],templates:{}}:{...cleanWorkouts([rawWorkout('one')]),total:2}),/incomplete/);
 await assert.rejects(fetchSession(()=>{},async()=>({...cleanWorkouts([rawWorkout('one')]),total:2})),/changed/);
 await assert.rejects(fetchSession(()=>{},async()=>({workouts:[],templates:{},total:0})),/No workouts/);
 let calls=0;await assert.rejects(fetchSession(()=>{},async()=>{if(calls++)throw Error('offline');return {...cleanWorkouts([rawWorkout('one')]),total:2};}),/offline/);
});
test('credentials travel in POST JSON, never URLs; service errors remain visible',async()=>{
 await sessionRequest({action:'login',username:'test-user',password:'test-pass'},async(url,options)=>{assert.equal(url,'/api/hevy');assert.equal(options.method,'POST');assert.equal(options.credentials,'same-origin');assert.equal(JSON.parse(options.body).password,'test-pass');return Response.json({username:'test-user'});});
 await assert.rejects(sessionRequest({action:'login'},async()=>Response.json({error:'Use your Hevy password.'},{status:401})),/Hevy password/);
});
test('sync uses only the account bound to the encrypted cookie and rotates expired tokens',async()=>{
 const key=randomBytes(32),oldSecret=process.env.HEVY_SESSION_SECRET,oldFetch=globalThis.fetch,calls=[];
 process.env.HEVY_SESSION_SECRET=key.toString('base64');
 const expired={...session,expires_at:'2020-01-01T00:00:00Z'};
 globalThis.fetch=async(url,opts)=>{calls.push({url,opts});if(url.endsWith('auth/refresh_token'))return Response.json({access_token:'rotated-access',refresh_token:'rotated-refresh',expires_at:'2099-01-01T00:00:00Z'});assert.equal(opts.headers.Authorization,'Bearer rotated-access');return url.includes('user_workouts_paged')?Response.json({workouts:[rawWorkout('one')]}):Response.json({workout_count:1});};
 try{
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await handler({method:'POST',headers:{origin:'https://hevy-muscle-atlas.vercel.app','content-type':'application/json',cookie:'__Host-atlas-session='+sealSession(expired,key)},body:{action:'workouts',offset:0,username:'someone-else',url:'https://attacker.test'}},res);
  assert.equal(res.body.total,1);assert.equal(calls.length,3);
  const history=new URL(calls[1].url);assert.equal(history.searchParams.get('username'),session.username);
  assert.ok(calls.every(c=>c.url.startsWith('https://api.hevyapp.com/')));
  const cookie=res.headers['Set-Cookie'].split(';')[0].split('=')[1];assert.equal(openSession(cookie,key).refresh_token,'rotated-refresh');
  assert.ok(!JSON.stringify(res.body).includes('rotated'));
 }finally{globalThis.fetch=oldFetch;if(oldSecret===undefined)delete process.env.HEVY_SESSION_SECRET;else process.env.HEVY_SESSION_SECRET=oldSecret;}
});
