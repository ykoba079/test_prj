// Search from image/fixture geometry; never read the simulated fruit pose.
export const CONTACT_SEARCH={centerOffset:.44,rate:.20,timeout:4,sealTimeout:1.4,bottomDwell:.35,cupBottomOffset:.1175,cupTravel:.08,rollerClearance:.025,maxHorizontalGap:.24};
export function stepContactSearch(state,{dt,now,nominalY,centerY=nominalY-CONTACT_SEARCH.centerOffset,tcpY,cupBottomY=null,horizontalGap=0,rollerTopY,contact,sealed}){
  state.elapsed=(state.elapsed||0)+dt;state.depth??=0;
  // Only measured robot geometry is used here, never a simulated fruit pose.
  const cupOffset=Number.isFinite(cupBottomY)?Math.max(CONTACT_SEARCH.cupBottomOffset-CONTACT_SEARCH.cupTravel,Math.min(CONTACT_SEARCH.cupBottomOffset+CONTACT_SEARCH.cupTravel,tcpY-cupBottomY)):CONTACT_SEARCH.cupBottomOffset;
  const lowerCupY=Math.max(centerY,rollerTopY+CONTACT_SEARCH.rollerClearance),bottom=lowerCupY+cupOffset,aligned=horizontalGap<=CONTACT_SEARCH.maxHorizontalGap;
  if(contact||sealed){state.contactAt??=now;return {y:tcpY,reason:now-state.contactAt>CONTACT_SEARCH.sealTimeout?'pressure-timeout':null};}
  // Do not consume probe travel while joints are still above the commanded height.
  const current=Math.max(bottom,nominalY-state.depth);
  if(aligned&&tcpY<=current+.035)state.depth=Math.max(0,Math.min(nominalY-bottom,state.depth+CONTACT_SEARCH.rate*dt));
  const y=Math.max(bottom,nominalY-state.depth);
  const actualCupY=Number.isFinite(cupBottomY)?cupBottomY:tcpY-cupOffset;
  state.bottomTime=aligned&&actualCupY<=lowerCupY+.035&&y<=bottom+1e-6?(state.bottomTime||0)+dt:0;
  return {y,lowerCupY,cupOffset,aligned,reason:state.bottomTime>=CONTACT_SEARCH.bottomDwell?'no-contact':state.elapsed>CONTACT_SEARCH.timeout?'motion-timeout':null};
}
