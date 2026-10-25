// This module accepts calibrated image measurements only. No meshes or simulator IDs.
export const PICK_ZONE={minX:1.55,maxX:3.25,maxZ:1.3};
export const TRACK_RULE={maxAge:3,expireAge:5,minFrames:12,defaultLeadSeconds:.5};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function fuseViews(views){
  const observations=[];
  for(const view of views){
    const used=new Set();
    for(const d of view.detections){
      const candidates=observations.filter(o=>!used.has(o)&&!o.views.includes(view.id)).map(o=>({o,distance:distance(o,d)})).filter(c=>c.distance<.42).sort((a,b)=>a.distance-b.distance);
      if(candidates.length&&(!candidates[1]||candidates[1].distance-candidates[0].distance>.12)){
        const o=candidates[0].o;used.add(o);o.views.push(view.id);o.defects=[...new Set([...o.defects,...d.defects])];for(const [key,value] of Object.entries(d.scores||{}))o.scores[key]=Math.max(o.scores[key]||0,value);
      }else if(!candidates.length)observations.push({...d,views:[view.id],defects:[...d.defects],scores:{...d.scores}});
    }
  }
  return observations;
}
export function createImageTracker(){
  let tracks=[],records=[],nextId=1;
  const events=[];
  function note(t,message){t.events.push(message);if(t.events.length>10)t.events.shift();events.push({id:t.id,message});}
  function predict(t,time){const age=Math.max(0,time-t.lastSeen);return {x:t.x+t.vx*age,z:t.z+t.vz*age};}
  function close(t,state,reason){if(t.closed)return;t.closed=true;t.state=state;t.reason=reason;note(t,reason);}
  function update(observations,time,frame){
    const eligible=tracks.filter(t=>!t.closed&&['observing','approaching'].includes(t.state)&&time-t.lastSeen<=TRACK_RULE.expireAge);
    const pairs=[];
    for(const t of eligible)for(const [i,d] of observations.entries()){
      const dt=Math.max(.01,time-t.lastSeen),gap=distance(predict(t,time),d);
      if(gap<Math.min(1.8,.5+dt*.45))pairs.push({t,i,gap});
    }
    const matchedT=new Set(),matchedD=new Set(),ambiguous=new Set();
    for(const p of pairs.sort((a,b)=>a.gap-b.gap)){
      if(matchedT.has(p.t)||matchedD.has(p.i))continue;
      const rivals=pairs.filter(q=>(q.t===p.t&&q.i!==p.i&&!matchedD.has(q.i))||(q.i===p.i&&q.t!==p.t&&!matchedT.has(q.t)));
      if(rivals.some(q=>Math.abs(q.gap-p.gap)<.16)){ambiguous.add(p.i);p.t.ambiguous=true;continue;}
      matchedT.add(p.t);matchedD.add(p.i);observe(p.t,observations[p.i],time,frame);
    }
    for(const [i,d] of observations.entries())if(!matchedD.has(i)&&!ambiguous.has(i)&&d.x<=PICK_ZONE.maxX&&!records.some(t=>(t.closed||t.state==='sorting')&&time-t.lastSeen<2&&distance(predict(t,time),d)<.65)){
      const t={id:'T'+nextId++,x:d.x,z:d.z,vx:0,vz:0,lastSeen:time,firstSeen:time,frames:0,lastFrame:-1,evidence:{mold:0,damage:0},lastEvidence:{mold:-1,damage:-1},defects:new Set(),scores:{},views:new Set(),events:[],state:'observing',closed:false,ambiguous:false};
      tracks.push(t);records.push(t);note(t,'画像から追跡開始');observe(t,d,time,frame);
    }
    if(records.length>80)records=records.slice(-80);
    return observations;
  }
  function observe(t,d,time,frame){
    if(t.frames&&time>t.lastSeen){const dt=time-t.lastSeen,vx=(d.x-t.x)/dt,vz=(d.z-t.z)/dt;if(Math.abs(vx)<2.5&&Math.abs(vz)<1.5){t.vx=t.frames===1?vx:.65*vx+.35*t.vx;t.vz=t.frames===1?vz:.65*vz+.35*t.vz;}}
    t.x=d.x;t.z=d.z;t.lastSeen=time;t.ambiguous=false;for(const v of d.views||[])t.views.add(v);
    for(const [key,value] of Object.entries(d.scores||{}))t.scores[key]=Math.max(t.scores[key]||0,value);
    if(t.lastFrame!==frame){t.frames++;t.lastFrame=frame;}
    for(const kind of new Set(d.defects))if(t.lastEvidence[kind]!==frame){t.lastEvidence[kind]=frame;t.evidence[kind]++;if(t.evidence[kind]>=2&&!t.defects.has(kind)){t.defects.add(kind);note(t,(kind==='mold'?'カビ':'傷')+'確定（別撮影2回）');}}
  }
  function eligible(t,now){return !t.closed&&t.state==='observing'&&!t.ambiguous&&t.frames>=2&&now-t.lastSeen<=TRACK_RULE.maxAge;}
  function outcome(t){return t.defects.size?'reject':t.frames>=TRACK_RULE.minFrames&&!Object.values(t.evidence).some(Boolean)?'good':'unknown';}
  function target(t,now,lead=TRACK_RULE.defaultLeadSeconds){if(!eligible(t,now))return null;const p=predict(t,now+lead);return p.x>=PICK_ZONE.minX&&p.x<=PICK_ZONE.maxX&&Math.abs(p.z)<=PICK_ZONE.maxZ?{...p,y:.35}:null;}
  return {get tracks(){return tracks;},get records(){return records;},predict,update,note,close,eligible,outcome,target,
    drainEvents(){return events.splice(0);},
    reset(){tracks=[];records=[];events.length=0;nextId=1;},
    shiftTime(seconds){for(const t of tracks)if(!t.closed){t.lastSeen+=seconds;t.firstSeen+=seconds;}},
    prune(){tracks=tracks.filter(t=>!t.closed);},
  };
}
