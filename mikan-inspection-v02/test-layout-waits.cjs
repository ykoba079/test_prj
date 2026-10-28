const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const source=name=>fs.readFileSync(path.join(__dirname,name),'utf8'),uri=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
(async()=>{
 const {rollerRole,rollerPositions,ROLLER_PITCHES,ROLLER_TRIAL}=await import(uri(source('roller-layout.js')));
 for(const pitch of ROLLER_PITCHES){const xs=rollerPositions(pitch),old=xs.map((x,i)=>x>=-2-1e-8&&x<=2.2+1e-8?i:null).filter(i=>i!==null),now=xs.map((x,i)=>rollerRole(x,pitch)!=='normal'?i:null).filter(i=>i!==null);assert.equal(now[0]-old[0],5);assert.equal(now.length,old.length);assert.ok(now.every((i,n)=>rollerRole(xs[i],pitch)===(n%2?'fast':'slow')));}
 assert.equal(ROLLER_PITCHES.length,6);assert.equal(ROLLER_TRIAL.shiftRollers,5);
 const trackingUri=uri(source('tracking.js')),{PICK_ZONE}=await import(trackingUri),{PICK_RULE,canDescend,hoverReady,chooseIntercept}=await import(uri(source('pick-planning.js').replace(/\.\/tracking\.js\?v=[^']+/,trackingUri)));
 assert.equal(PICK_RULE.minFinalX,PICK_ZONE.minX);assert.equal(PICK_RULE.maxFinalX,PICK_ZONE.maxX);
 const tracker={pickable:()=>false,uncertainty:()=>.04,predict:()=>({x:2,z:0})},t={state:'approaching',stable:true,ambiguous:false,missedFrames:1,lastSeen:1};
 assert.ok(canDescend(tracker,t,1.2,.2));assert.equal(canDescend(tracker,t,1.5,.2),false);assert.equal(canDescend(tracker,{...t,missedFrames:2},1.2),false);assert.equal(canDescend(tracker,{...t,state:'observing'},1.2),false);assert.equal(canDescend(tracker,{...t,ambiguous:true},1.2),false);assert.equal(canDescend({...tracker,uncertainty:()=>.2},t,1.2),false);
 assert.ok(hoverReady({x:2,y:1.43,z:0},{x:2.03,y:1.42,z:0}));assert.equal(hoverReady({x:2,y:1.7,z:0},{x:2,y:1.42,z:0}),false);
 const steady={pickable:()=>true,uncertainty:()=>0,predict:()=>({x:1.3,z:0})};assert.equal(chooseIntercept(steady,{lastSeen:0},0,()=>.2),null,'upstream target must not descend then wait above fruit outside the seal zone');
 console.log('PASS five-index shift at all six pitches, matched pickup bounds, moving-hover entry and bounded single-frame occlusion');
})().catch(e=>{console.error(e);process.exitCode=1;});
