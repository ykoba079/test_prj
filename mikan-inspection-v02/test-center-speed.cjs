const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const uri=file=>'data:text/javascript;base64,'+fs.readFileSync(path.join(__dirname,file)).toString('base64');
(async()=>{
 const {createArmServo,ARM,ARM_REST}=await import(uri('arm-kinematics.js')),{createSlopeGeometry}=await import(uri('slope.js')),{stepContactSearch,CONTACT_SEARCH}=await import(uri('contact-search.js'));
 const timings=[];for(const target of [{x:2.2,y:.79,z:0},{x:1.7,y:1.5,z:3.5},{x:3.1,y:.6,z:-.3}]){
  const durations=[];for(const scale of [1,2]){const s=createArmServo(ARM_REST,scale);s.command(target);let time=0;while(!s.near(target,.06)&&time<10){s.step(.005);time+=.005;}assert.ok(time<10);durations.push(time);}
  assert.ok(Math.abs(durations[1]/durations[0]-.5)<.04,JSON.stringify(durations));timings.push({target,durations});
 }
 const heights=[];for(const degrees of [0,2,5])for(const x of [1.55,2.3,3.1]){
  const g=createSlopeGeometry(degrees),centerY=g.heightAt(x),nominalY=centerY+.44,rollerTopY=g.heightAt(x,.02),state={};let result={y:nominalY};
  for(let i=0;i<250&&!result.reason;i++)result=stepContactSearch(state,{dt:.02,now:i*.02,nominalY,centerY,tcpY:result.y,rollerTopY,contact:false,sealed:false});
  assert.equal(result.reason,'no-contact');assert.ok(state.depth>.30,'search must extend past the former .18 limit');assert.ok(Math.abs(result.y-CONTACT_SEARCH.cupBottomOffset-centerY)<1e-8,'cup bottom should reach the estimated center plane');
  const actual=result.y+.15,stopped=stepContactSearch(state,{dt:.02,now:5,nominalY,centerY,tcpY:actual,rollerTopY,contact:true,sealed:false});assert.equal(stopped.y,actual,'a physical contact must hold the current tool height');assert.equal(stopped.reason,null);heights.push({degrees,x,centerY,bottom:result.y-CONTACT_SEARCH.cupBottomOffset});
 }
 assert.equal(ARM.motionScale,2);console.log('PASS 2x time scaling, slope-adjusted center depth, physical-contact stop and empty-search failure');console.log(JSON.stringify({timings,heights}));
})().catch(e=>{console.error(e);process.exitCode=1;});
