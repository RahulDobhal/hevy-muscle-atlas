// Region counts describe exercise emphasis, not isolated fibre activation.
const region=(id,name,anatomy,pattern)=>({id,name,anatomy,pattern});
export const REGIONS={
 chest:[region('upper','Upper chest','Clavicular head',/clavicular.*pectoralis major/i),region('mid','Mid chest','Sternocostal head',/sternocostal.*pectoralis major/i),region('lower','Lower chest','Abdominal fibres',/abdominal.*pectoralis major/i)],
 shoulders:[region('front','Front delts','Anterior deltoid',/clavicular.*deltoid/i),region('side','Side delts','Lateral deltoid',/acromial.*deltoid/i),region('rear','Rear delts','Posterior deltoid',/spinal.*deltoid/i)],
 biceps:[region('long','Long head','Biceps brachii',/long head.*biceps brachii/i),region('short','Short head','Biceps brachii',/short head.*biceps brachii/i),region('brachialis','Brachialis','Brachialis',/brachialis/i)],
 triceps:[region('long','Long head','Triceps brachii',/long head.*triceps brachii/i),region('lateral','Lateral head','Triceps brachii',/lateral head.*triceps brachii/i),region('medial','Medial head','Triceps brachii',/medial head.*triceps brachii/i)],
 forearms:[region('flexors','Flexors','Wrist & finger flexors',/flexor|palmaris|pronator/i),region('extensors','Extensors','Wrist & finger extensors',/extensor|supinator/i),region('brachio','Brachioradialis','Brachioradialis',/brachioradialis/i)],
 traps:[region('upper','Upper traps','Descending fibres',/descending.*trapezius/i),region('middle','Mid traps','Transverse fibres',/transverse.*trapezius/i),region('lower','Lower traps','Ascending fibres',/ascending.*trapezius/i)],
 upper_back:[region('rhomboids','Rhomboids','Rhomboid major & minor',/rhomboid/i),region('teres','Teres','Teres major & minor',/teres/i),region('infraspinatus','Infraspinatus','Rotator cuff',/infraspinatus/i)],
 abdominals:[region('rectus','Rectus','Rectus abdominis',/rectus abdominis/i),region('obliques','Obliques','Internal & external obliques',/oblique/i),region('transverse','Transverse','Transversus abdominis',/transversus abdominis/i)],
 quadriceps:[region('rectus','Rectus femoris','Central quadriceps',/rectus femoris/i),region('lateral','Outer quad','Vastus lateralis',/vastus lateralis/i),region('medial','Inner quad','Vastus medialis',/vastus medialis/i),region('deep','Deep quad','Vastus intermedius',/vastus intermedius/i)],
 hamstrings:[region('biceps','Outer hamstring','Biceps femoris',/biceps femoris/i),region('semi','Inner hamstrings','Semitendinosus & semimembranosus',/semimembranosus|semitendinosus/i)],
 calves:[region('gastroc','Gastrocnemius','Superficial calf',/gastrocnemius/i),region('soleus','Soleus','Deep calf',/soleus/i)],
 abductors:[region('medius','Glute medius','Gluteus medius',/gluteus medius/i),region('minimus','Glute minimus','Gluteus minimus',/gluteus minimus/i),region('tfl','TFL','Tensor fasciae latae',/tensor fasciae latae/i)]
};
export function regionOfStructure(group,name){return REGIONS[group]?.find(r=>r.pattern.test(name))?.id||null;}
// Standard horizontal press/fly templates map to mid chest; unknown custom movements remain general.
export function exerciseEmphasis(group,title){const n=title.toLowerCase();
 if(group==='chest'){if(/incline/.test(n))return'upper';if(/decline|chest dip/.test(n))return'lower';if(/bench press/.test(n)||/^(iso-lateral chest press|chest press|chest fly) \(machine\)$|pec deck/.test(n))return'mid';return'general';}
 if(group==='shoulders'){if(/reverse fly|rear delt|face pull/.test(n))return'rear';if(/lateral raise|upright row/.test(n))return'side';if(/press|front raise/.test(n))return'front';return'general';}
 return null;
}
export function regionalBreakdown(group,exercises){const rows=REGIONS[group]||[];const available=['chest','shoulders'].includes(group);const counts=Object.fromEntries([...rows.map(r=>r.id),'general'].map(k=>[k,{sets:0,drops:0}]));for(const e of exercises.filter(e=>e.role==='primary')){const id=exerciseEmphasis(group,e.title);if(id&&counts[id]){counts[id].sets+=e.count;counts[id].drops+=e.drops;}}return{rows,available,counts};}
