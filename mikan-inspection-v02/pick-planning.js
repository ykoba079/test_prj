import {PICK_ZONE,TRACK_RULE} from './tracking.js?v=20261027-havok-grip';
export const PICK_RULE={stationX:2.3,hoverY:1.42,closeSeconds:.25,maxFinalLead:1.5,minFinalX:1.2,maxFinalX:3.1,followLeadSeconds:.4};
// estimate() is derived from robot joints. tracker data is calibrated image data only.
export function chooseIntercept(tracker,track,now,estimate,onReject=()=>{}){
  function reject(reason,details={}){onReject(reason,details);return null;}
  if(!tracker.pickable(track,now))return reject(track.missedFrames?'最新画像に対象なし':!track.stable?'移動位置が不安定':'新しい位置観測を待機',{age:now-track.lastSeen,error:tracker.uncertainty(track,now)});let lead=.7,aim;
  for(let n=0;n<4;n++){
    aim=tracker.predict(track,now+lead);const travel=estimate({x:aim.x,y:.67,z:aim.z});
    if(!Number.isFinite(travel))return reject('関節可動域外');lead=Math.max(PICK_RULE.closeSeconds,travel+PICK_RULE.closeSeconds+.04);
    if(lead>PICK_RULE.maxFinalLead)return reject('下降動作の準備待ち',{lead});
  }
  aim=tracker.predict(track,now+lead);
  if(aim.x<PICK_RULE.minFinalX||aim.x>PICK_RULE.maxFinalX||Math.abs(aim.z)>PICK_ZONE.maxZ)return reject('把持区間へ到着するまで待機',{aim});
  if(now+lead-track.lastSeen>TRACK_RULE.gripAge||!tracker.pickable(track,now,lead))return reject('位置予測の確度不足',{lead,age:now-track.lastSeen,error:tracker.uncertainty(track,now,lead)});
  return {aim:{...aim,y:.35},tcp:{...aim,y:.67},contactAt:now+lead,lead};
}
