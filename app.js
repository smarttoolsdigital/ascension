import * as C from './core.js';
import { openStore } from './db.js';

let store, events = [], state = { sessions: [], recovery: [] }, deviceId = 'dev';
let view = 'home';
const $ = (s) => document.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };

async function boot(){
  store = await openStore(); deviceId = store.deviceId; events = await store.all(); refold(); render();
  $('#boot').classList.add('gone');
  if('serviceWorker' in navigator){ try{ await navigator.serviceWorker.register('./sw.js'); }catch(e){} }
}
function refold(){ state = C.foldEvents(events); }
async function push(evt){ events.push(evt); refold(); render(); try{ await store.append(evt); }catch(e){ console.warn('persist failed',e); } }
function today(){ return C.dayKey(); }
function currentSession(){ return state.sessions.find((s)=>!s.completed && s.sets.some((st)=>C.dayKey(new Date(st.ts))===today())); }
function lastWeight(exName,fallback){ let best=null; for(const s of state.sessions) for(const st of s.sets) if(st.exercise===exName && st.weight!=null){ if(!best||st.ts>best.ts) best=st; } return best?best.weight:fallback; }
function setsLogged(sessionId, exName){ const s=state.sessions.find((x)=>x.id===sessionId); return s?s.sets.filter((st)=>st.exercise===exName).length:0; }
function historySummary(){ return C.historySummary(state.sessions); }
let pendingWeights={};
function weightFor(exName,def){ return pendingWeights[exName]!=null?pendingWeights[exName]:lastWeight(exName,def); }
function latestRecovery(){ return state.recovery[state.recovery.length-1]; }
function lumenLine(){
  const h=historySummary(), rec=latestRecovery(), done=C.completedToday(state.sessions);
  if(done) return 'The trial is complete. Eat, recover, and let the work settle into the bones.';
  if(rec && rec.sleep < 6) return 'Sleep was thin. Train with control, not ego. The Hall respects restraint.';
  if(h.streak >= 7) return `Your streak is ${h.streak} days. Momentum has weight now. Guard it.`;
  if(h.total === 0) return 'Start small. One set logged is no longer a plan. It is evidence.';
  return 'The room is awake. One honest set opens the next door.';
}
function directive(){ return C.localDirective(state.sessions,state.recovery); }
async function logSet(trial, ex){ const cur=currentSession(); const sid=cur?cur.id:C.newId('s'); const idx=setsLogged(sid,ex.n); await push(C.EV.setLogged(sid,ex.n,weightFor(ex.n,ex.w),idx,deviceId)); toast('Set logged. The Hall remembers.'); }
async function completeTrial(trial){ const cur=currentSession(); const sid=cur?cur.id:C.newId('s'); await push(C.EV.sessionCompleted(sid,trial.id,trial.name,today(),deviceId)); pendingWeights={}; toast('Trial complete. Sleep like you earned it.'); }
async function logRecovery(sleep,readiness,mood){ await push(C.EV.recoveryLogged(sleep,readiness,mood,deviceId)); toast('Logged. Tomorrow will know.'); }
function exportBackup(){ const blob=new Blob([C.makeBackup(events,deviceId)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=el('a'); a.href=url; a.download=`ascension-backup-${C.dayKey()}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),2000); }
async function importBackup(file){ const text=await file.text(); const incoming=C.readBackup(text); const ids=new Set(events.map(e=>e.id)); const add=incoming.filter(e=>!ids.has(e.id)); events=events.concat(add); refold(); try{ await store.import(add); }catch{} render(); toast(`Restored ${add.length} events.`); }
let toastT; function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('on'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('on'),3000); }

function render(){ const app=$('#app'); app.innerHTML=''; app.appendChild(renderHeader()); if(view==='home') app.appendChild(renderHome()); if(view==='today') app.appendChild(renderToday()); if(view==='history') app.appendChild(renderHistory()); if(view==='more') app.appendChild(renderMore()); app.appendChild(renderNav()); }
function renderHeader(){ const h=historySummary(); const wrap=el('div','header'); wrap.appendChild(el('div','brand','ASCENSION')); wrap.appendChild(el('div','streak',`🔥 <b>${h.streak}</b> day${h.streak===1?'':'s'}`)); return wrap; }
function renderHome(){
  const trial=C.trialForToday(state.sessions); const dir=directive(); const wrap=el('div','view');
  const hero=el('section','sanctuary');
  hero.innerHTML=`<div class="window"></div><div class="fire"></div><div class="table"></div><div class="sword"></div><div class="mirror"></div><div class="heroText"><div class="eyebrow">Sanctuary</div><h1>Good morning, Joshua.</h1><p>${dir.directive}</p></div><div class="lumen"><b>LUMEN</b><span>${lumenLine()}</span></div>`;
  wrap.appendChild(hero);
  const quick=el('div','quick');
  [['⚔','Trial','today'],['🌙','Night','more'],['📜','Record','history']].forEach(([ico,label,target])=>{ const b=el('button','qbtn',`${ico}<span>${label}</span>`); b.onclick=()=>{view=target;render();}; quick.appendChild(b); });
  wrap.appendChild(quick);
  const card=el('div','directive'); card.innerHTML=`<div class="dlabel">Today's Trial</div><div class="dtext">${trial.name}</div><div class="dwhy">${trial.focus}</div><button class="complete" id="startTrial">Continue Today's Trial</button>`; wrap.appendChild(card); card.querySelector('#startTrial').onclick=()=>{view='today';render();};
  const h=historySummary(); const mini=el('div','stats'); mini.innerHTML=`<div class="stat"><b>${h.total}</b><span>trials</span></div><div class="stat"><b>${events.length}</b><span>events saved</span></div>`; wrap.appendChild(mini);
  return wrap;
}
function renderToday(){
  const wrap=el('div','view'), trial=C.trialForToday(state.sessions), done=C.completedToday(state.sessions), dir=directive();
  wrap.appendChild(el('div','directive',`<div class="dlabel">The Directive</div><div class="dtext">${dir.directive}</div><div class="dwhy">${dir.why}</div>`));
  wrap.appendChild(el('div','trialhead',`<div class="tname">${trial.name}</div><div class="tfocus">${trial.focus}</div>`));
  if(done){ wrap.appendChild(el('div','donecard','✦ Today is done. The body remembers every honest rep.')); return wrap; }
  const cur=currentSession();
  trial.ex.forEach((ex)=>{ const row=el('div','exrow'); const logged=cur?setsLogged(cur.id,ex.n):0; const dots=Array.from({length:ex.s},(_,i)=>`<span class="dot ${i<logged?'on':''}"></span>`).join(''); row.innerHTML=`<div class="exmain"><div class="exname">${ex.n}</div><div class="exmeta">${ex.s>1?ex.s+' × ':''}${ex.r}</div><div class="dots">${dots}</div></div>`; const right=el('div','exright'); if(ex.w>0){ const w=weightFor(ex.n,ex.w); const wt=el('div','weight',`<button class="wbtn" data-d="-1">−</button><span class="wval">${w}<i>lb</i></span><button class="wbtn" data-d="1">+</button>`); wt.querySelectorAll('.wbtn').forEach((b)=>b.onclick=()=>{pendingWeights[ex.n]=Math.max(0,weightFor(ex.n,ex.w)+(b.dataset.d==='1'?2.5:-2.5));render();}); right.appendChild(wt); } const logBtn=el('button','logbtn',logged>=ex.s?'✓':'Log set'); logBtn.disabled=logged>=ex.s; logBtn.onclick=()=>logSet(trial,ex); right.appendChild(logBtn); row.appendChild(right); wrap.appendChild(row); });
  const complete=el('button','complete',trial.rec?'Complete Recovery':'Complete the Trial'); complete.onclick=()=>completeTrial(trial); wrap.appendChild(complete); return wrap;
}
function renderHistory(){ const h=historySummary(); const wrap=el('div','view'); wrap.appendChild(el('div','sectitle','The Record')); const grid=el('div','stats'); const stat=(v,l)=>`<div class="stat"><b>${v}</b><span>${l}</span></div>`; grid.innerHTML=stat(h.streak,'streak')+stat(h.total,'trials')+stat(h.sessions7,'last 7 days')+stat(h.sessions30,'last 30'); wrap.appendChild(grid); if(h.recent.length){ wrap.appendChild(el('div','sectitle','Recent')); h.recent.forEach(r=>wrap.appendChild(el('div','histrow',`<span>${r.dayKey}</span><span>${r.trialName}</span><span>${r.sets} sets</span>`))); } else wrap.appendChild(el('div','empty','No trials yet. The first one is the only hard one.')); return wrap; }
function renderMore(){ const wrap=el('div','view'); wrap.appendChild(el('div','sectitle','Last Night')); const rec=el('div','reccard'); const mk=(label,id,min,max,val)=>`<label>${label}<input type="range" id="${id}" min="${min}" max="${max}" step="0.5" value="${val}"><b id="${id}v">${val}</b></label>`; rec.innerHTML=mk('Sleep','sleep',3,9,7)+mk('Readiness','ready',1,10,7)+mk('Mood','mood',1,10,7); const save=el('button','logbtn wide','Log the night'); rec.appendChild(save); wrap.appendChild(rec); rec.querySelectorAll('input').forEach(i=>i.oninput=()=>{$('#'+i.id+'v').textContent=i.value;}); save.onclick=()=>logRecovery(+$('#sleep').value,+$('#ready').value,+$('#mood').value);
  wrap.appendChild(el('div','sectitle','Your Data')); const backend=store?store.backend:'—'; const warn=backend==='memory'?`<div class="warn">⚠ Memory-only here. Data will not survive reload. Install to Home Screen over HTTPS.</div>`:`<div class="ok">Stored durably (${backend}). ${events.length} events.</div>`; const dc=el('div','datacard',warn); const exp=el('button','logbtn','Export backup'); exp.onclick=exportBackup; const imp=el('button','logbtn','Import backup'); const file=el('input'); file.type='file'; file.accept='application/json'; file.style.display='none'; file.onchange=()=>file.files[0]&&importBackup(file.files[0]); imp.onclick=()=>file.click(); const btns=el('div','databtns'); btns.append(exp,imp,file); dc.appendChild(btns); wrap.appendChild(dc);
  wrap.appendChild(el('div','sectitle','The World')); const hall=el('a','hallbtn','Enter the Hall →'); hall.href='./hall.html'; wrap.appendChild(hall); wrap.appendChild(el('div','fine','The Hall is the room this tool lives in. Reliability first, world second.'));
  wrap.appendChild(el('div','install','<span class="smallcaps">Install</span><br>On iPhone: Share → Add to Home Screen. Then open from the icon so Ascension feels like an app, not a Safari tab.'));
  return wrap; }
function renderNav(){ const nav=el('div','nav'); [['home','Home'],['today','Today'],['history','Record'],['more','More']].forEach(([id,label])=>{ const b=el('button','nb'+(view===id?' on':''),label); b.onclick=()=>{view=id;render();}; nav.appendChild(b); }); return nav; }
boot();
