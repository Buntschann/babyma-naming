
const $=s=>document.querySelector(s);
const storage={get(k,d){try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},set(k,v){localStorage.setItem(k,JSON.stringify(v))}};
const state={candidates:[],history:[],comments:[],supabase:null,room:"",actor:"",deviceId:"",compare:[]};
const now=()=>new Date().toISOString();
const fmt=i=>new Intl.DateTimeFormat("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(i));
const count=s=>[...(s||"")].length;
const strokeTotal=s=>{const n=(s||"").match(/\d+/g);return n?n.map(Number).reduce((a,b)=>a+b,0):null};
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const statusName=s=>({candidate:"候補",hold:"保留",rejected:"却下"}[s]||"候補");

function load(){
 const cfg=storage.get("babyma_settings",{});
 state.deviceId=storage.get("babyma_device_id","")||crypto.randomUUID();
 storage.set("babyma_device_id",state.deviceId);
 state.room=cfg.room||"";state.actor=cfg.actor||"";
 $("#roomInput").value=state.room;$("#actorInput").value=state.actor;
 $("#supabaseUrlInput").value=cfg.supabaseUrl||"";$("#supabaseKeyInput").value=cfg.supabaseKey||"";
 state.candidates=storage.get("babyma_candidates",[]).map(c=>({
   status:"candidate",likes:{mako:false,nae:false},meaning:"",nanori:"",stroke_order:"",...c,
   likes:c.likes||{mako:!!c.favorite,nae:false}
 }));
 state.history=storage.get("babyma_history",[]);
 state.comments=storage.get("babyma_comments",[]);
 state.compare=storage.get("babyma_compare",[]);
}
function persist(){storage.set("babyma_candidates",state.candidates);storage.set("babyma_history",state.history);storage.set("babyma_comments",state.comments);storage.set("babyma_compare",state.compare)}
async function connect(){
 const cfg=storage.get("babyma_settings",{});
 if(!cfg.supabaseUrl||!cfg.supabaseKey||!cfg.room){state.supabase=null;$("#syncBadge").textContent="端末保存";return}
 try{state.supabase=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseKey);state.room=cfg.room;state.actor=cfg.actor||"家族";$("#syncBadge").textContent="共有同期";await refresh()}
 catch(e){console.error(e);$("#syncBadge").textContent="同期エラー"}
}
async function refresh(){
 if(!state.supabase)return;
 const [a,b,c]=await Promise.all([
  state.supabase.from("name_candidates").select("*").eq("room_code",state.room),
  state.supabase.from("name_history").select("*").eq("room_code",state.room).order("created_at",{ascending:false}),
  state.supabase.from("name_comments").select("*").eq("room_code",state.room).order("created_at",{ascending:true})
 ]);
 if(a.error||b.error||c.error)throw(a.error||b.error||c.error);
 state.candidates=(a.data||[]).map(x=>({...x,likes:{mako:!!x.like_mako,nae:!!x.like_nae}}));
 state.history=b.data||[];state.comments=c.data||[];persist();render()
}
async function history(action,c,detail=""){
 const row={room_code:state.room||"local",actor:state.actor||"この端末",owner_device_id:state.deviceId,action,candidate_name:c?.name||"",candidate_reading:c?.reading||"",detail};
 if(state.supabase){const {error}=await state.supabase.from("name_history").insert(row);if(error)throw error}
 else{row.id=crypto.randomUUID();row.created_at=now();state.history.unshift(row)}
}
async function addCandidate(){
 const name=$("#nameInput").value.trim(),reading=$("#readingInput").value.trim();if(!name||!reading){alert("名前と読みを入れてま！");return}
 const tags=$("#tagsInput").value.split(",").map(x=>x.trim()).filter(Boolean);
 const row={room_code:state.room||"local",name,reading,strokes_text:$("#strokesInput").value.trim(),stroke_total:strokeTotal($("#strokesInput").value),char_count:count(name),memo:$("#memoInput").value.trim(),tags,actor:state.actor||"この端末",owner_device_id:state.deviceId,status:"candidate",meaning:$("#meaningInput").value.trim(),nanori:$("#nanoriInput").value.trim(),stroke_order:$("#strokeOrderInput").value.trim(),like_mako:false,like_nae:false};
 if(state.supabase){const {data,error}=await state.supabase.from("name_candidates").insert(row).select().single();if(error)throw error;await history("候補追加",data);await refresh()}
 else{row.id=crypto.randomUUID();row.created_at=now();row.likes={mako:false,nae:false};state.candidates.unshift(row);await history("候補追加",row);persist();render()}
 ["#nameInput","#readingInput","#strokesInput","#tagsInput","#memoInput","#meaningInput","#nanoriInput","#strokeOrderInput"].forEach(s=>$(s).value="");preview()
}
async function updateCandidate(c,patch,action,detail=""){
 if(state.supabase){
   const dbPatch={...patch};
   if(patch.likes){dbPatch.like_mako=patch.likes.mako;dbPatch.like_nae=patch.likes.nae;delete dbPatch.likes}
   let {error}=await state.supabase.from("name_candidates").update(dbPatch).eq("id",c.id);if(error)throw error;
   await history(action,c,detail);await refresh()
 } else {Object.assign(c,patch);await history(action,c,detail);persist();render()}
}
async function toggleLike(c,key){
 const likes={...(c.likes||{mako:false,nae:false}),[key]:!c.likes?.[key]};
 await updateCandidate(c,{likes},likes[key]?`${key==="mako"?"まこしゃ":"なえちゃ"}お気に入り登録`:`${key==="mako"?"まこしゃ":"なえちゃ"}お気に入り解除`)
}
async function setStatus(c,status){await updateCandidate(c,{status},"状態変更",statusName(status))}
async function delCandidate(c){
 if(!confirm(`文谷 ${c.name} を候補から削除しま？`))return;
 await history("候補削除",c);
 if(state.supabase){let {error}=await state.supabase.from("name_candidates").delete().eq("id",c.id);if(error)throw error;await refresh()}
 else{state.candidates=state.candidates.filter(x=>x.id!==c.id);state.comments=state.comments.filter(x=>x.candidate_id!==c.id);state.compare=state.compare.filter(id=>id!==c.id);persist();render()}
}
async function addComment(c,input){
 const text=input.value.trim();if(!text)return;
 const row={room_code:state.room||"local",candidate_id:c.id,actor:state.actor||"この端末",owner_device_id:state.deviceId,comment:text};
 if(state.supabase){let {error}=await state.supabase.from("name_comments").insert(row);if(error)throw error;await history("コメント追加",c,text);await refresh()}
 else{row.id=crypto.randomUUID();row.created_at=now();state.comments.push(row);await history("コメント追加",c,text);persist();render()}
}
async function deleteHistory(h){
 if(h.owner_device_id!==state.deviceId)return;
 if(state.supabase){let {error}=await state.supabase.from("name_history").delete().eq("id",h.id).eq("owner_device_id",state.deviceId);if(error)throw error;await refresh()}
 else{state.history=state.history.filter(x=>x.id!==h.id);persist();render()}
}
function toggleCompare(c){
 if(state.compare.includes(c.id)) state.compare=state.compare.filter(x=>x!==c.id);
 else {if(state.compare.length>=4){alert("比較は4件までま！");return}state.compare.push(c.id)}
 persist();renderCompare();render()
}
function renderCompare(){
 const grid=$("#compareGrid");grid.innerHTML="";
 state.compare=state.compare.filter(id=>state.candidates.some(c=>c.id===id));
 state.compare.map(id=>state.candidates.find(c=>c.id===id)).forEach(c=>{
  const d=document.createElement("div");d.className="compare-item";
  const likes=(c.likes?.mako?1:0)+(c.likes?.nae?1:0);
  d.innerHTML=`<div class="compare-name">文谷 ${esc(c.name)}</div><div class="full-reading">ぶんや ${esc(c.reading)}</div>
    <div class="compare-table">
    <div><span>画数</span><strong>${c.stroke_total??"—"}</strong></div>
    <div><span>文字数</span><strong>${c.char_count??count(c.name)}</strong></div>
    <div><span>状態</span><strong>${statusName(c.status)}</strong></div>
    <div><span>★</span><strong>${likes}/2</strong></div>
    <div><span>提案</span><strong>${esc(c.actor||"家族")}</strong></div>
    </div>`;
  grid.appendChild(d)
 })
 if(!state.compare.length)grid.innerHTML='<div class="hint">まだ比較対象がなま。</div>'
}
function sorted(){
 const q=$("#searchInput").value.trim().toLowerCase(),sf=$("#statusFilter").value;
 let a=state.candidates.filter(c=>(sf==="all"||c.status===sf)&&(!q||[c.name,c.reading,c.memo,c.actor,c.meaning,c.nanori,c.stroke_order,...(c.tags||[])].some(v=>(v||"").toLowerCase().includes(q))));
 const s=$("#sortSelect").value,txt=(a,b)=>(a||"").localeCompare(b||"","ja"),n=v=>v==null?99999:Number(v),likes=c=>(c.likes?.mako?1:0)+(c.likes?.nae?1:0);
 const f={
 created_desc:(a,b)=>new Date(b.created_at)-new Date(a.created_at),created_asc:(a,b)=>new Date(a.created_at)-new Date(b.created_at),
 reading_asc:(a,b)=>txt(a.reading,b.reading),reading_desc:(a,b)=>txt(b.reading,a.reading),
 strokes_asc:(a,b)=>n(a.stroke_total)-n(b.stroke_total),strokes_desc:(a,b)=>n(b.stroke_total)-n(a.stroke_total),
 chars_asc:(a,b)=>n(a.char_count)-n(b.char_count),chars_desc:(a,b)=>n(b.char_count)-n(a.char_count),
 likes_desc:(a,b)=>likes(b)-likes(a)||new Date(b.created_at)-new Date(a.created_at),proposer_asc:(a,b)=>txt(a.actor,b.actor)
 };return a.sort(f[s])
}
function render(){
 const list=$("#candidateList");list.innerHTML="";const arr=sorted();$("#emptyState").hidden=arr.length>0;
 const favCount=state.candidates.filter(c=>c.likes?.mako||c.likes?.nae).length;
 $("#stats").textContent=`候補 ${state.candidates.length}件 ／ ★あり ${favCount}件 ／ 保留 ${state.candidates.filter(c=>c.status==="hold").length}件 ／ 却下 ${state.candidates.filter(c=>c.status==="rejected").length}件`;
 arr.forEach(c=>{
  const n=$("#candidateTemplate").content.cloneNode(true);
  n.querySelector(".full-name").textContent=`文谷　${c.name}`;n.querySelector(".full-reading").textContent=`ぶんや　${c.reading}`;
  const chips=n.querySelector(".chips");
  [[`${c.char_count??count(c.name)}文字`,""],[c.stroke_total!=null?`${c.stroke_total}画`:"画数未入力",""],[`${c.actor||"家族"}提案`,"proposer"],[statusName(c.status),c.status==="hold"?"status-hold":c.status==="rejected"?"status-rejected":""]].forEach(([t,cl])=>{let s=document.createElement("span");s.className=`chip ${cl}`;s.textContent=t;chips.appendChild(s)});
  (c.tags||[]).forEach(t=>{let s=document.createElement("span");s.className="chip tag";s.textContent=`#${t}`;chips.appendChild(s)});
  n.querySelector(".memo").textContent=c.memo||"";
  n.querySelector(".meaning").textContent=c.meaning||"—";n.querySelector(".nanori").textContent=c.nanori||"—";n.querySelector(".stroke-order").textContent=c.stroke_order||"—";
  const ss=n.querySelector(".status-select");ss.value=c.status||"candidate";ss.onchange=()=>setStatus(c,ss.value);
  const vm=n.querySelector(".vote-mako"),vn=n.querySelector(".vote-nae");vm.classList.toggle("on",!!c.likes?.mako);vn.classList.toggle("on",!!c.likes?.nae);vm.textContent=`${c.likes?.mako?"★":"☆"} まこしゃ`;vn.textContent=`${c.likes?.nae?"★":"☆"} なえちゃ`;vm.onclick=()=>toggleLike(c,"mako");vn.onclick=()=>toggleLike(c,"nae");
  n.querySelector(".created").textContent=`${fmt(c.created_at)} ・ ${c.actor||"家族"}`;n.querySelector(".delete").onclick=()=>delCandidate(c);
  const ca=n.querySelector(".compare-add");ca.textContent=state.compare.includes(c.id)?"比較から外す":"比較に追加";ca.onclick=()=>toggleCompare(c);
  const cl=n.querySelector(".comment-list");state.comments.filter(x=>x.candidate_id===c.id).forEach(cm=>{let d=document.createElement("div");d.className="comment";d.innerHTML=`<div class="comment-meta">${esc(cm.actor)} ・ ${esc(fmt(cm.created_at))}</div>${esc(cm.comment)}`;cl.appendChild(d)});
  const ci=n.querySelector(".comment-input");n.querySelector(".comment-add").onclick=()=>addComment(c,ci);list.appendChild(n)
 });
 const hl=$("#historyList");hl.innerHTML="";$("#historyCount").textContent=`(${state.history.length})`;
 state.history.forEach(h=>{let d=document.createElement("div");d.className="history-item";let own=h.owner_device_id===state.deviceId;d.innerHTML=`<div class="history-row"><div><strong>${esc(h.action)}</strong>　文谷 ${esc(h.candidate_name)}<div class="history-meta">${esc(fmt(h.created_at))} ・ ${esc(h.actor)}${h.detail?" ・ "+esc(h.detail):""}</div></div>${own?'<button class="history-delete secondary">自分の履歴を削除</button>':""}</div>`;if(own)d.querySelector(".history-delete").onclick=()=>deleteHistory(h);hl.appendChild(d)});
 renderCompare()
}
function preview(){ $("#previewName").textContent=`文谷　${$("#nameInput").value.trim()||"——"}`;$("#previewReading").textContent=`ぶんや　${$("#readingInput").value.trim()||"——"}`}
$("#nameInput").oninput=preview;$("#readingInput").oninput=preview;$("#addBtn").onclick=addCandidate;$("#searchInput").oninput=render;$("#sortSelect").onchange=render;$("#statusFilter").onchange=render;
$("#clearCompareBtn").onclick=()=>{state.compare=[];persist();render()};
$("#settingsBtn").onclick=()=>$("#settingsDialog").showModal();$("#closeSettingsBtn").onclick=()=>$("#settingsDialog").close();
$("#generateRoomBtn").onclick=()=>$("#roomInput").value="BABYMA-"+Math.random().toString(36).slice(2,8).toUpperCase();
$("#saveSettingsBtn").onclick=async()=>{storage.set("babyma_settings",{actor:$("#actorInput").value.trim(),room:$("#roomInput").value.trim(),supabaseUrl:$("#supabaseUrlInput").value.trim(),supabaseKey:$("#supabaseKeyInput").value.trim()});state.actor=$("#actorInput").value.trim();state.room=$("#roomInput").value.trim();$("#settingsDialog").close();await connect();render()};
load();render();connect();
