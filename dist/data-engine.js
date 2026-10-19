export const GROUPS=[
['chest','Chest','Pectoralis major','front'],['shoulders','Shoulders','Deltoids','front'],['biceps','Biceps','Biceps brachii · brachialis','front'],['triceps','Triceps','Triceps brachii','back'],['forearms','Forearms','Forearm flexors & extensors','front'],['lats','Lats','Latissimus dorsi','back'],['upper_back','Upper back','Rhomboids · teres major','back'],['traps','Traps','Trapezius','back'],['lower_back','Lower back','Erector spinae','back'],['abdominals','Abdominals','Rectus abdominis · obliques','front'],['quadriceps','Quads','Quadriceps femoris','front'],['hamstrings','Hamstrings','Biceps femoris · semitendinosus','back'],['glutes','Glutes','Gluteus maximus','back'],['calves','Calves','Gastrocnemius · soleus','back'],['abductors','Hip abductors','Gluteus medius · minimus · TFL','back'],['adductors','Adductors','Adductor group · gracilis','front'],['neck','Neck','Sternocleidomastoid · splenius','front']].map(([id,name,latin,view])=>({id,name,latin,view}));
export const dayOf=(t,timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone)=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(t));const get=k=>p.find(x=>x.type===k).value;return `${get('year')}-${get('month')}-${get('day')}`;};
const DAY=86400000;
export function activeSet(s){return s.type!=='warmup' && ((s.reps??0)>0 || (s.duration_seconds??0)>0 || (s.distance_meters??0)>0);}
export function calculate(data,period='28'){
 const sorted=[...data.workouts].sort((a,b)=>Date.parse(a.start_time)-Date.parse(b.start_time));
 if(!sorted.length)throw new Error('No workouts found.');
 const end=Date.parse(dayOf(sorted.at(-1).start_time)+'T00:00:00Z');
 const start=period==='all'?Date.parse(dayOf(sorted[0].start_time)+'T00:00:00Z'):end-(Number(period)-1)*DAY;
 const days=Math.round((end-start)/DAY)+1;
 const workouts=sorted.filter(w=>{const d=Date.parse(dayOf(w.start_time)+'T00:00:00Z');return d>=start&&d<=end});
 const bins=period==='28'?4:period==='7'?7:6;
 const results=Object.fromEntries(GROUPS.map(g=>[g.id,{primary:0,secondary:0,drops:0,secondaryDrops:0,sessions:new Set(),exercises:{},weekly:Array(bins).fill(0)}]));
 let total=0,totalDrops=0,unmapped=0;
 for(const w of workouts)for(const e of w.exercises){
  const t=data.templates[e.exercise_template_id]; const sets=e.sets.filter(activeSet); if(!t){unmapped+=sets.length;continue;}
  const normal=sets.filter(s=>s.type!=='dropset'),drop=sets.filter(s=>s.type==='dropset');
  if(results[t.primary_muscle_group]){total+=normal.length;totalDrops+=drop.length;}
  const roles=[[t.primary_muscle_group,'primary'],...[...new Set(t.secondary_muscle_groups||[])].filter(g=>g!==t.primary_muscle_group).map(g=>[g,'secondary'])];
  for(const [g,role] of roles){const r=results[g];if(!r||!sets.length)continue;r[role]+=normal.length;r[role==='primary'?'drops':'secondaryDrops']+=drop.length;
   if(role==='primary'){r.sessions.add(w.id);const idx=Math.min(bins-1,Math.floor((Date.parse(dayOf(w.start_time)+'T00:00:00Z')-start)/DAY/days*bins));r.weekly[idx]+=normal.length;}
   const key=e.exercise_template_id+':'+role;let row=r.exercises[key];if(!row)row=r.exercises[key]={id:e.exercise_template_id,title:e.title,role,type:t.type,equipment:t.equipment,count:0,drops:0,history:[]};row.count+=normal.length;row.drops+=drop.length;row.history.push({workoutId:w.id,date:dayOf(w.start_time),sets});
  }
 }
 return {results,total,totalDrops,unmapped,workouts,start,end,days,bins};
}
export function muscleForStructure(n){
 n=n.toLowerCase();
 if(/pectoralis/.test(n))return'chest';if(/deltoid/.test(n))return'shoulders';
 if(/biceps brachii|brachialis/.test(n))return'biceps';if(/triceps brachii|anconeus/.test(n))return'triceps';
 if(/latissimus/.test(n))return'lats';if(/trapezius/.test(n))return'traps';
 if(/rhomboid|teres major|infraspinatus|teres minor/.test(n))return'upper_back';
 if(/iliocostalis|longissimus thoracis|spinalis thoracis|multifidus|quadratus lumborum/.test(n))return'lower_back';
 if(/rectus abdominis|oblique|transversus abdominis/.test(n)&&!/capitis/.test(n))return'abdominals';
 if(/rectus femoris|vastus/.test(n))return'quadriceps';
 if(/biceps femoris|semitendinosus|semimembranosus/.test(n))return'hamstrings';
 if(/gluteus maximus/.test(n))return'glutes';
 if(/gluteus medius|gluteus minimus|tensor fasciae latae/.test(n))return'abductors';
 if(/adductor (longus|magnus|brevis|minimus)|gracilis|pectineus/.test(n))return'adductors';
 if(/gastrocnemius|soleus|plantaris/.test(n))return'calves';
 if(/brachioradialis|carpi|pronator|supinator|palmaris|flexor digitorum (superficialis|profundus)|extensor digitorum$|extensor indicis|flexor pollicis longus|extensor pollicis (longus|brevis)|abductor pollicis longus/.test(n))return'forearms';
 if(/sternocleidomastoid|splenius|scalenus/.test(n))return'neck';return null;
}
export function parseCSV(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell='';}else cell+=c;}if(quoted)throw new Error('The CSV has an unclosed quoted field.');if(cell||row.length){row.push(cell);rows.push(row);}return rows;}
export function importCSV(text,templates){
 const [headers,...rows]=parseCSV(text.replace(/^\uFEFF/,''));if(!headers)throw new Error('The file is empty.');const keys=headers.map(h=>h.trim().toLowerCase());
 for(const key of ['title','start_time','exercise_title','set_type'])if(!keys.includes(key))throw new Error('Expected a Hevy CSV export with '+key+'.');
 const byName=new Map(Object.values(templates).map(t=>[t.title.toLowerCase(),t.id])); const out=new Map();
 const parseDate=s=>{let d=Date.parse(s);if(!/Z$|[+-]\d\d:\d\d$/.test(s)){const m=s.match(/(\d{1,2})\s+(\w{3})\s+(\d{4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)/);if(m){const mo=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(m[2])+1;d=Date.parse(`${m[3]}-${String(mo).padStart(2,'0')}-${m[1].padStart(2,'0')}T${m[4]}`);}else if(/^\d{4}-\d\d-\d\d[T ]/.test(s))d=Date.parse(s.replace(' ','T'));}if(!Number.isFinite(d))throw new Error('Could not read workout date: '+s);return new Date(d).toISOString();};
 const num=s=>s==null||s.trim()===''?null:Number(s);
 for(const cells of rows){const r=Object.fromEntries(keys.map((k,i)=>[k,cells[i]||'']));const start=parseDate(r.start_time),key=start+'|'+r.title;let w=out.get(key);if(!w){w={id:key,title:r.title,start_time:start,end_time:r.end_time?parseDate(r.end_time):start,exercises:[]};out.set(key,w);}let e=w.exercises.find(e=>e.title===r.exercise_title);if(!e){e={title:r.exercise_title,exercise_template_id:byName.get(r.exercise_title.toLowerCase())||'unmapped:'+r.exercise_title,sets:[]};w.exercises.push(e);}e.sets.push({type:r.set_type,weight_kg:num(r.weight_kg),reps:num(r.reps),duration_seconds:num(r.duration_seconds),distance_meters:r.distance_km?num(r.distance_km)*1000:num(r.distance_meters)});}
 return [...out.values()];
}
export function validateData(data){if(!Array.isArray(data.workouts)||!data.workouts.length||!data.templates||typeof data.templates!=='object')throw new Error('Use a Muscle Atlas JSON backup or a Hevy CSV export.');for(const w of data.workouts){if(!Number.isFinite(Date.parse(w.start_time))||!Array.isArray(w.exercises))throw new Error('Invalid workout dates or exercises.');for(const e of w.exercises){if(!Array.isArray(e.sets))throw new Error('Invalid exercise sets.');for(const s of e.sets)for(const k of ['weight_kg','reps','duration_seconds','distance_meters'])if(s[k]!=null&&(!Number.isFinite(s[k])||s[k]<0))throw new Error('Set values must be non-negative numbers.');}}return data;}
