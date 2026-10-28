// Search from image/fixture geometry; never read the simulated fruit pose.
export const CONTACT_SEARCH={depth:.18,rate:.10,timeout:4,sealTimeout:1.4,bottomDwell:.35,cupBottomOffset:.1175,rollerClearance:.025};
export function stepContactSearch(state,{dt,now,nominalY,tcpY,rollerTopY,contact,sealed}){
  state.elapsed=(state.elapsed||0)+dt;state.depth??=0;
  const bottom=Math.max(nominalY-CONTACT_SEARCH.depth,rollerTopY+CONTACT_SEARCH.cupBottomOffset+CONTACT_SEARCH.rollerClearance);
  if(contact||sealed){state.contactAt??=now;return {y:nominalY-state.depth,reason:now-state.contactAt>CONTACT_SEARCH.sealTimeout?'pressure-timeout':null};}
  // Do not consume probe travel while joints are still above the commanded height.
  const current=Math.max(bottom,nominalY-state.depth);
  if(tcpY<=current+.035)state.depth=Math.min(nominalY-bottom,state.depth+CONTACT_SEARCH.rate*dt);
  const y=Math.max(bottom,nominalY-state.depth);
  state.bottomTime=tcpY<=bottom+.035&&y<=bottom+1e-6?(state.bottomTime||0)+dt:0;
  return {y,reason:state.bottomTime>=CONTACT_SEARCH.bottomDwell?'no-contact':state.elapsed>CONTACT_SEARCH.timeout?'motion-timeout':null};
}
