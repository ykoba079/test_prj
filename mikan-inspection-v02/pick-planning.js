import {PICK_ZONE,TRACK_RULE} from './tracking.js?v=20261030-contour-track';
export const PICK_RULE={hoverY:1.42,settleSeconds:.20,tcpHeight:.79,maxFinalLead:1.5,minFinalX:PICK_ZONE.minX,maxFinalX:PICK_ZONE.maxX,maxFollowLead:.5,occlusionAge:.45,occlusionHorizon:.8,occlusionUncertainty:.12};
export function canDescend(tracker,t,now,lead=0){
  return tracker.pickable(t,now,lead)||!t.closed&&t.state==='approaching'&&t.stable&&!t.ambiguous&&t.missedFrames===1&&now-t.lastSeen<=PICK_RULE.occlusionAge&&now+lead-t.lastSeen<=PICK_RULE.occlusionHorizon&&tracker.uncertainty(t,now,lead)<=PICK_RULE.occlusionUncertainty;
}
export function hoverReady(tcp,target){return Math.hypot(tcp.x-target.x,tcp.y-target.y,tcp.z-target.z)<.12;}
export function observedInPickZone(track){return Number.isFinite(track.x)&&Number.isFinite(track.z)&&track.x>=PICK_ZONE.minX&&track.x<=PICK_ZONE.maxX&&Math.abs(track.z)<=PICK_ZONE.maxZ;}
export function pickStartStatus(tracker,t,now,collectUnknown=false){
  const blocked=(code,reason)=>({ready:false,code,reason});
  if(t.closed||t.state!=='observing')return blocked('inactive','追跡終了・処理済み');
  if(!t.defects.size&&!(collectUnknown&&tracker.outcome(t)==='unknown'))return blocked('classification','不良未検出');
  if(t.ambiguous)return blocked('ambiguous','対象の対応が曖昧');
  if(t.missedFrames)return blocked('missing','上方Aで果実の位置を再確認待ち');
  if(now-t.lastSeen>TRACK_RULE.startAge)return blocked('stale','位置画像が古い（'+Math.round((now-t.lastSeen)*1000)+' ms）');
  if(!observedInPickZone(t))return blocked('zone',t.x<PICK_ZONE.minX?'把持範囲への進入待ち':'把持範囲外');
  if(!t.stable||t.frames<2)return blocked('motion','位置・速度の安定待ち（観測'+t.frames+'回）');
  if(tracker.uncertainty(t,now)>TRACK_RULE.maxUncertainty)return blocked('uncertain','予測位置の誤差が大きい');
  return {ready:true,code:'ready',reason:'把持候補'};
}
// estimate() is derived from robot joints. tracker data is calibrated image data only.
export function chooseIntercept(tracker,track,now,estimate,onReject=()=>{},heightAt=()=>.35){
  function reject(reason,details={}){onReject(reason,details);return null;}
  if(!canDescend(tracker,track,now))return reject(track.missedFrames?'最新画像に対象なし':!track.stable?'移動位置が不安定':'新しい位置観測を待機',{age:now-track.lastSeen,error:tracker.uncertainty(track,now)});let lead=.7,aim;
  for(let n=0;n<4;n++){
    aim=tracker.predict(track,now+lead);const travel=estimate({x:aim.x,y:heightAt(aim.x)+PICK_RULE.tcpHeight-.35,z:aim.z});
    if(!Number.isFinite(travel))return reject('関節可動域外');lead=Math.max(PICK_RULE.settleSeconds,travel+PICK_RULE.settleSeconds+.04);
    if(lead>PICK_RULE.maxFinalLead)return reject('下降動作の準備待ち',{lead});
  }
  aim=tracker.predict(track,now+lead);
  if(aim.x<PICK_RULE.minFinalX||aim.x>PICK_RULE.maxFinalX||Math.abs(aim.z)>PICK_ZONE.maxZ)return reject('把持区間へ到着するまで待機',{aim});
  if(now+lead-track.lastSeen>TRACK_RULE.gripAge||!canDescend(tracker,track,now,lead))return reject('位置予測の確度不足',{lead,age:now-track.lastSeen,error:tracker.uncertainty(track,now,lead)});
  return {aim:{...aim,y:heightAt(aim.x)},tcp:{...aim,y:heightAt(aim.x)+PICK_RULE.tcpHeight-.35},contactAt:now+lead,lead};
}
