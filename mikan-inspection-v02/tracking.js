// This module accepts calibrated image measurements only. No meshes or simulator IDs.
export const PICK_ZONE={minX:1.55,maxX:4.0,maxZ:1.3};
export const TRACK_RULE={maxAge:3,expireAge:5,minFrames:12,defaultLeadSeconds:.5,startAge:1.3,gripAge:2.5,maxUncertainty:.28,defectObservations:1};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function fuseViews(views){
  const primary=views.find(v=>v.id==='A');
  const observations=(primary?.detections||[]).map(d=>({...d,views:['A'],defects:[...d.defects],scores:{...d.scores}}));
  // Auxiliary views add defect evidence only; they never move a track or create an ID.
  for(const view of views.filter(v=>v.id!=='A')){
    const used=new Set();
    for(const d of view.detections){
      const candidates=observations.filter(o=>!used.has(o)).map(o=>({o,distance:distance(o,d)})).filter(c=>c.distance<.42).sort((a,b)=>a.distance-b.distance);
      if(candidates.length&&(!candidates[1]||candidates[1].distance-candidates[0].distance>.12)){
        const o=candidates[0].o;used.add(o);o.views.push(view.id);o.defects=[...new Set([...o.defects,...d.defects])];for(const [key,value] of Object.entries(d.scores||{}))o.scores[key]=Math.max(o.scores[key]||0,value);
      }
    }
  }
  return observations;
}
export function createImageTracker(){
  let tracks=[],records=[],nextId=1;
  const events=[];
  function note(t,message){t.events.push(message);if(t.events.length>10)t.events.shift();events.push({id:t.id,message});}
  function predict(t,time){const age=Math.max(0,time-t.lastSeen);return {x:(t.fitX??t.x)+t.vx*age,z:(t.fitZ??t.z)+t.vz*age};}
  function close(t,state,reason){if(t.closed)return;t.closed=true;t.state=state;t.reason=reason;note(t,reason);}
  function update(observations,time,frame){
    const eligible=tracks.filter(t=>!t.closed&&['observing','approaching'].includes(t.state)&&time>=t.lastSeen&&time-t.lastSeen<=TRACK_RULE.expireAge);
    const pairs=[];
    for(const t of eligible)for(const [i,d] of observations.entries()){
      const dt=Math.max(.01,time-t.lastSeen),prior=t.frames<2?{x:t.x+.7*dt,z:t.z}:predict(t,time),gap=distance(prior,d);
      // Broad forward gate for the first association. The prior is never used for picking.
      const forward=d.x-t.x,lateral=Math.abs(d.z-t.z),gate=t.frames<2?Math.min(2.8,.45+1.8*dt):Math.min(1.8,.5+dt*.8);
      if(gap<gate&&lateral<.4+dt*.2&&forward>=-.35-dt*.2)pairs.push({t,i,gap});
    }
    const matchedT=new Set(),matchedD=new Set(),ambiguous=new Set();
    for(const p of pairs.sort((a,b)=>a.gap-b.gap)){
      if(matchedT.has(p.t)||matchedD.has(p.i))continue;
      const rivals=pairs.filter(q=>(q.t===p.t&&q.i!==p.i&&!matchedD.has(q.i))||(q.i===p.i&&q.t!==p.t&&!matchedT.has(q.t)));
      if(rivals.some(q=>Math.abs(q.gap-p.gap)<.16)){ambiguous.add(p.i);p.t.ambiguous=true;continue;}
      matchedT.add(p.t);matchedD.add(p.i);observe(p.t,observations[p.i],time,frame);
    }
    for(const [i,d] of observations.entries())if(!matchedD.has(i)&&!ambiguous.has(i)&&d.x<=PICK_ZONE.maxX&&!records.some(t=>(t.closed||t.state==='sorting')&&time-t.lastSeen<2&&distance(predict(t,time),d)<.65)){
      const t={id:'T'+nextId++,x:d.x,z:d.z,vx:0,vz:0,lastSeen:time,firstSeen:time,samples:[],fitX:d.x,fitZ:d.z,fitError:0,speedChange:0,stable:false,missedFrames:0,missedAtFrame:-1,frames:0,lastFrame:-1,evidence:{mold:0,damage:0},lastEvidence:{mold:-1,damage:-1},defects:new Set(),scores:{},views:new Set(),events:[],state:'observing',closed:false,ambiguous:false};
      tracks.push(t);records.push(t);note(t,'画像から追跡開始');observe(t,d,time,frame);
    }
    for(const t of eligible)if(t.lastFrame!==frame&&time>=t.lastSeen&&t.missedAtFrame!==frame){t.missedAtFrame=frame;t.missedFrames++;}
    if(records.length>80)records=records.slice(-80);
    return observations;
  }
  function observe(t,d,time,frame){
    const fresh=t.lastFrame!==frame;
    if(fresh){
      t.samples.push({time,x:d.x,z:d.z});t.samples=t.samples.filter(p=>time-p.time<=5).slice(-3);
      t.x=d.x;t.z=d.z;t.lastSeen=time;fitMotion(t);
    }
    t.ambiguous=false;t.missedFrames=0;for(const v of d.views||[])t.views.add(v);
    for(const [key,value] of Object.entries(d.scores||{}))t.scores[key]=Math.max(t.scores[key]||0,value);
    if(t.lastFrame!==frame){t.frames++;t.lastFrame=frame;}
    recordDefects(t,d,frame);
  }
  function recordDefects(t,d,frame){
    for(const kind of new Set(d.defects))if(t.lastEvidence[kind]!==frame){t.lastEvidence[kind]=frame;t.evidence[kind]++;t.scores[kind]=Math.max(t.scores[kind]||0,d.scores?.[kind]||0);}
    for(const kind of ['mold','damage'])if(t.evidence[kind]>=TRACK_RULE.defectObservations&&!t.defects.has(kind)){t.defects.add(kind);note(t,(kind==='mold'?'カビ':'傷')+'確定（不良検出1回）');}
  }
  function confirmAuxiliary(detections,time,frame,view){
    const matched=new Set();for(const d of detections){const options=tracks.filter(t=>!t.closed&&!matched.has(t)&&['observing','approaching'].includes(t.state)&&t.lastFrame!==frame&&time>=t.lastSeen&&time-t.lastSeen<=TRACK_RULE.gripAge).map(t=>({t,gap:distance(predict(t,time),d)})).filter(c=>c.gap<.25).sort((a,b)=>a.gap-b.gap);
      if(!options.length||options[1]&&options[1].gap-options[0].gap<.1)continue;const t=options[0].t;matched.add(t);t.missedFrames=0;t.auxiliarySeen=time;t.views.add(view);recordDefects(t,d,frame);
    }
  }
  function fitMotion(t){
    const points=t.samples,n=points.length;if(n<2){t.fitX=t.x;t.fitZ=t.z;t.stable=false;return;}
    const end=points[n-1].time;let sw=0,st=0,sx=0,sz=0;
    points.forEach((p,i)=>{const w=i+1;sw+=w;st+=w*(p.time-end);sx+=w*p.x;sz+=w*p.z;});
    const mt=st/sw,mx=sx/sw,mz=sz/sw;let denom=0,numX=0,numZ=0;
    points.forEach((p,i)=>{const w=i+1,dt=p.time-end-mt;denom+=w*dt*dt;numX+=w*dt*(p.x-mx);numZ+=w*dt*(p.z-mz);});
    if(denom<1e-8)return;
    t.vx=numX/denom;t.vz=numZ/denom;t.fitX=mx-t.vx*mt;t.fitZ=mz-t.vz*mt;
    t.fitError=Math.sqrt(points.reduce((sum,p,i)=>sum+(i+1)*((p.x-(t.fitX+t.vx*(p.time-end)))**2+(p.z-(t.fitZ+t.vz*(p.time-end)))**2),0)/sw);
    const last=points[n-1],previous=points[n-2],dt=Math.max(.01,last.time-previous.time);
    t.speedChange=Math.hypot((last.x-previous.x)/dt-t.vx,(last.z-previous.z)/dt-t.vz);
    t.stable=n>=3&&t.fitError<.12&&t.speedChange<.45&&t.vx>=-.15&&t.vx<=1.8&&Math.abs(t.vz)<.5;
  }
  function uncertainty(t,now,lead=0){return .035+2*t.fitError+.35*t.speedChange*Math.max(0,now+lead-t.lastSeen);}
  function pickable(t,now,lead=0){return !t.closed&&['observing','approaching'].includes(t.state)&&!t.ambiguous&&!t.missedFrames&&t.stable&&now-t.lastSeen<=TRACK_RULE.startAge&&uncertainty(t,now,lead)<=TRACK_RULE.maxUncertainty;}
  function eligible(t,now){return !t.closed&&t.state==='observing'&&!t.ambiguous&&!t.missedFrames&&t.frames>=2&&now-t.lastSeen<=TRACK_RULE.maxAge;}
  function outcome(t){return t.defects.size?'reject':t.frames>=TRACK_RULE.minFrames&&!Object.values(t.evidence).some(Boolean)?'good':'unknown';}
  function target(t,now,lead=TRACK_RULE.defaultLeadSeconds){if(!eligible(t,now))return null;const p=predict(t,now+lead);return p.x>=PICK_ZONE.minX&&p.x<=PICK_ZONE.maxX&&Math.abs(p.z)<=PICK_ZONE.maxZ?{...p,y:.35}:null;}
  return {get tracks(){return tracks;},get records(){return records;},predict,update,note,close,eligible,outcome,target,uncertainty,pickable,confirmAuxiliary,
    drainEvents(){return events.splice(0);},
    reset(){tracks=[];records=[];events.length=0;nextId=1;},
    shiftTime(seconds){for(const t of tracks)if(!t.closed){t.lastSeen+=seconds;t.firstSeen+=seconds;for(const p of t.samples)p.time+=seconds;}},
    prune(){tracks=tracks.filter(t=>!t.closed);},
  };
}
