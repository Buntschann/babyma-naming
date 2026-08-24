
const $=s=>document.querySelector(s);
const storage={get(k,d){try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},set(k,v){localStorage.setItem(k,JSON.stringify(v))}};
const cfg=window.BABYMA_CONFIG||{};
let sb=null;
const state={candidates:[],history:[],comments:[],compare:[],actor:"",user:null,editing:null};
const ROOM="BABYMA";
const now=()=>new Date().toISOString();
const fmt=i=>new Intl.DateTimeFormat("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(i));
const count=s=>[...(s||"")].length;
const strokeTotal=s=>{const n=(s||"").match(/\d+/g);return n?n.map(Number).reduce((a,b)=>a+b,0):null};
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const statusName=s=>({candidate:"候補",hold:"保留",rejected:"却下"}[s]||"候補");
const isKanji=ch=>/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u.test(ch);
const debounce=(fn,ms=500)=>{let t;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),ms)}};

function parseTags(value){
 return [...new Set((value||"").split(",").map(x=>x.trim()).filter(Boolean))];
}
function allTags(){
 return [...new Set(state.candidates.flatMap(c=>c.tags||[]))].sort((a,b)=>a.localeCompare(b,"ja"));
}
function toggleTagInput(input,tag){
 const tags=parseTags(input.value);
 const i=tags.indexOf(tag);
 if(i>=0) tags.splice(i,1); else tags.push(tag);
 input.value=tags.join(",");
}
function renderTagSuggestions(container,input){
 container.innerHTML="";
 const current=parseTags(input.value);
 allTags().forEach(tag=>{
   const b=document.createElement("button");
   b.type="button";b.className="tag-suggestion"+(current.includes(tag)?" selected":"");
   b.textContent="#"+tag;
   b.onclick=()=>{toggleTagInput(input,tag);renderTagSuggestions(container,input)};
   container.appendChild(b);
 });
}
async function fetchStrokeInfo(name,input,statusEl){
 const chars=[...(name||"").trim()];
 if(!chars.length){input.value="";input.dataset.total="";statusEl.textContent="名前を入力すると自動取得しま";return null}
 const kanji=chars.filter(isKanji);
 if(!kanji.length){input.value="";input.dataset.total="";statusEl.textContent="漢字がないため自動取得できなま";return null}
 statusEl.textContent="画数を取得中…";
 try{
   const rows=await Promise.all(kanji.map(async ch=>{
     const r=await fetch("https://kanjiapi.dev/v1/kanji/"+encodeURIComponent(ch));
     if(!r.ok) throw new Error(ch);
     const j=await r.json();
     return {ch,strokes:j.stroke_count};
   }));
   const text=rows.map(x=>x.strokes).join("+");
   const total=rows.reduce((n,x)=>n+x.strokes,0);
   input.value=text;
   input.dataset.total=String(total);
   statusEl.textContent=rows.map(x=>`${x.ch} ${x.strokes}画`).join(" ／ ")+` → 合計 ${total}画`;
   return total;
 }catch(e){
   input.value="";input.dataset.total="";
   statusEl.textContent="自動取得できなま。手入力を使ってま";
   return null;
 }
}
function enableManualStroke(input,statusEl){
 input.readOnly=false;input.focus();statusEl.textContent="手入力モードま";
}


function configReady(){
 return cfg.SUPABASE_URL && cfg.SUPABASE_PUBLISHABLE_KEY &&
 !cfg.SUPABASE_URL.includes("ここに") && !cfg.SUPABASE_PUBLISHABLE_KEY.includes("ここに");
}
function showAuth(msg=""){
 $("#authScreen").hidden=false;$("#appShell").hidden=true;$("#loginMessage").textContent=msg;
}
function showApp(){
 $("#authScreen").hidden=true;$("#appShell").hidden=false;
}
async function init(){
 if(!configReady()){showAuth("config.js に Project URL と Publishable key を設定してま。");return}
 sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY);
 const {data:{session}}=await sb.auth.getSession();
 if(session){await enter(session.user)}
 else showAuth();
 sb.auth.onAuthStateChange(async(event,session)=>{
   if(event==="SIGNED_OUT"||!session){state.user=null;showAuth()}
 });
}
async function login(){
 $("#loginMessage").textContent="ログイン中…";
 const email=$("#loginEmail").value.trim(),password=$("#loginPassword").value;
 if(!email||!password){$("#loginMessage").textContent="メールアドレスとパスワードを入れてま。";return}
 const {data,error}=await sb.auth.signInWithPassword({email,password});
 if(error){$("#loginMessage").textContent="ログインできなま：" + error.message;return}
 await enter(data.user);
}
async function enter(user){
 $("#loginMessage").textContent="";
 state.user=user;
 state.actor=storage.get("babyma_actor","");
 $("#actorInput").value=state.actor;
 $("#signedInAs").textContent=`ログイン中：${user.email||""}`;
 showApp();
 if(!state.actor) $("#settingsDialog").showModal();
 await refresh();
}
async function logout(){
 await sb.auth.signOut();
 state.candidates=[];state.history=[];state.comments=[];
 showAuth("ログアウトしまし。");
}
async function refresh(retry=0){
 const [a,b,c]=await Promise.all([
  sb.from("name_candidates").select("*").eq("room_code",ROOM).order("created_at",{ascending:false}),
  sb.from("name_history").select("*").eq("room_code",ROOM).order("created_at",{ascending:false}),
  sb.from("name_comments").select("*").eq("room_code",ROOM).order("created_at",{ascending:true})
 ]);
 const err=a.error||b.error||c.error;
 if(err){
   console.error(err);
   if(retry < 3 && /JWT issued at future/i.test(err.message||"")){
     $("#syncBadge").textContent="同期準備中…";
     await new Promise(r=>setTimeout(r,1500));
     return refresh(retry+1);
   }
   alert("共有データを読み込めなま：" + err.message);
   $("#syncBadge").textContent="同期エラー";
   return
 }
 $("#syncBadge").textContent="共有同期";
 state.candidates=(a.data||[]).map(x=>({...x,likes:{mako:!!x.like_mako,nae:!!x.like_nae}}));
 state.history=b.data||[];state.comments=c.data||[];
 state.compare=storage.get("babyma_compare",[]);
 render();
 renderTagSuggestions($("#tagSuggestions"),$("#tagsInput"));
}
async function history(action,c,detail=""){
 const row={room_code:ROOM,actor:state.actor||state.user?.email||"家族",owner_device_id:state.user.id,action,candidate_name:c?.name||"",candidate_reading:c?.reading||"",detail};
 const {error}=await sb.from("name_history").insert(row);if(error)throw error;
}
async function addCandidate(){
 if(!state.actor){$("#settingsDialog").showModal();return}
 const name=$("#nameInput").value.trim(),reading=$("#readingInput").value.trim();if(!name||!reading){alert("名前と読みを入れてま！");return}
 const tags=parseTags($("#tagsInput").value);
 const autoTotal=$("#strokesInput").dataset.total ? Number($("#strokesInput").dataset.total) : strokeTotal($("#strokesInput").value);
 const row={room_code:ROOM,name,reading,strokes_text:$("#strokesInput").value.trim(),stroke_total:autoTotal,char_count:count(name),memo:$("#memoInput").value.trim(),tags,actor:state.actor,owner_device_id:state.user.id,status:"candidate",meaning:$("#meaningInput").value.trim(),nanori:$("#nanoriInput").value.trim(),stroke_order:$("#strokeOrderInput").value.trim(),like_mako:false,like_nae:false};
 const {data,error}=await sb.from("name_candidates").insert(row).select().single();
 if(error){alert(error.message);return}
 await history("候補追加",data);await refresh();
 ["#nameInput","#readingInput","#strokesInput","#tagsInput","#memoInput","#meaningInput","#nanoriInput","#strokeOrderInput"].forEach(s=>$(s).value="");
 $("#strokesInput").dataset.total="";$("#strokesInput").readOnly=true;$("#strokeStatus").textContent="名前を入力すると自動取得しま";
 renderTagSuggestions($("#tagSuggestions"),$("#tagsInput"));preview();
}
async function updateCandidate(c,patch,action,detail=""){
 const dbPatch={...patch};
 if(patch.likes){dbPatch.like_mako=patch.likes.mako;dbPatch.like_nae=patch.likes.nae;delete dbPatch.likes}
 const {error}=await sb.from("name_candidates").update(dbPatch).eq("id",c.id);if(error){alert(error.message);return}
 await history(action,c,detail);await refresh();
}
async function toggleLike(c,key){
 const likes={...(c.likes||{mako:false,nae:false}),[key]:!c.likes?.[key]};
 await updateCandidate(c,{likes},likes[key]?`${key==="mako"?"まこしゃ":"なえちゃ"}お気に入り登録`:`${key==="mako"?"まこしゃ":"なえちゃ"}お気に入り解除`);
}
async function setStatus(c,status){await updateCandidate(c,{status},"状態変更",statusName(status))}
async function delCandidate(c){
 if(!confirm(`文谷 ${c.name} を候補から削除しま？`))return;
 await history("候補削除",c);
 const {error}=await sb.from("name_candidates").delete().eq("id",c.id);if(error){alert(error.message);return}
 state.compare=state.compare.filter(id=>id!==c.id);storage.set("babyma_compare",state.compare);await refresh();
}
async function addComment(c,input){
 const text=input.value.trim();if(!text)return;
 const row={room_code:ROOM,candidate_id:c.id,actor:state.actor||state.user.email,owner_device_id:state.user.id,comment:text};
 const {error}=await sb.from("name_comments").insert(row);if(error){alert(error.message);return}
 await history("コメント追加",c,text);await refresh();
}
async function deleteHistory(h){
 if(h.owner_device_id!==state.user.id)return;
 const {error}=await sb.from("name_history").delete().eq("id",h.id).eq("owner_device_id",state.user.id);
 if(error){alert(error.message);return} await refresh();
}

function openEdit(c){
 state.editing=c;
 $("#editName").value=c.name||"";
 $("#editReading").value=c.reading||"";
 $("#editStrokes").value=c.strokes_text||"";
 $("#editStrokes").dataset.total=c.stroke_total==null?"":String(c.stroke_total);
 $("#editStrokes").readOnly=true;
 $("#editStrokeStatus").textContent=c.stroke_total!=null?`現在 ${c.stroke_total}画`:"名前を変更すると自動取得しま";
 $("#editTags").value=(c.tags||[]).join(",");
 $("#editMeaning").value=c.meaning||"";
 $("#editNanori").value=c.nanori||"";
 $("#editStrokeOrder").value=c.stroke_order||"";
 $("#editMemo").value=c.memo||"";
 renderTagSuggestions($("#editTagSuggestions"),$("#editTags"));
 $("#editDialog").showModal();
}
async function saveEdit(){
 const c=state.editing;if(!c)return;
 const name=$("#editName").value.trim(),reading=$("#editReading").value.trim();
 if(!name||!reading){alert("名前と読みを入れてま！");return}
 const total=$("#editStrokes").dataset.total ? Number($("#editStrokes").dataset.total) : strokeTotal($("#editStrokes").value);
 const patch={
   name,reading,
   strokes_text:$("#editStrokes").value.trim(),
   stroke_total:total,
   char_count:count(name),
   tags:parseTags($("#editTags").value),
   meaning:$("#editMeaning").value.trim(),
   nanori:$("#editNanori").value.trim(),
   stroke_order:$("#editStrokeOrder").value.trim(),
   memo:$("#editMemo").value.trim()
 };
 const {error}=await sb.from("name_candidates").update(patch).eq("id",c.id);
 if(error){alert(error.message);return}
 await history("候補編集",{...c,...patch},"内容を更新");
 state.editing=null;$("#editDialog").close();await refresh();
}
function toggleCompare(c){
 if(state.compare.includes(c.id)) state.compare=state.compare.filter(x=>x!==c.id);
 else {if(state.compare.length>=4){alert("比較は4件までま！");return}state.compare.push(c.id)}
 storage.set("babyma_compare",state.compare);renderCompare();render();
}
function renderCompare(){
 const grid=$("#compareGrid");grid.innerHTML="";
 state.compare=state.compare.filter(id=>state.candidates.some(c=>c.id===id));storage.set("babyma_compare",state.compare);
 state.compare.map(id=>state.candidates.find(c=>c.id===id)).forEach(c=>{
  const d=document.createElement("div");d.className="compare-item";const likes=(c.likes?.mako?1:0)+(c.likes?.nae?1:0);
  d.innerHTML=`<div class="compare-name">文谷 ${esc(c.name)}</div><div class="full-reading">ぶんや ${esc(c.reading)}</div>
    <div class="compare-table">
    <div><span>画数</span><strong>${c.stroke_total??"—"}</strong></div>
    <div><span>文字数</span><strong>${c.char_count??count(c.name)}</strong></div>
    <div><span>状態</span><strong>${statusName(c.status)}</strong></div>
    <div><span>★</span><strong>${likes}/2</strong></div>
    <div><span>提案</span><strong>${esc(c.actor||"家族")}</strong></div></div>`;
  grid.appendChild(d);
 })
 if(!state.compare.length)grid.innerHTML='<div class="hint">まだ比較対象がなま。</div>';
}
function sorted(){
 const q=$("#searchInput").value.trim().toLowerCase(),sf=$("#statusFilter").value;
 let a=state.candidates.filter(c=>(sf==="all"||c.status===sf)&&(!q||[c.name,c.reading,c.memo,c.actor,c.meaning,c.nanori,c.stroke_order,...(c.tags||[])].some(v=>(v||"").toLowerCase().includes(q))));
 const s=$("#sortSelect").value,txt=(a,b)=>(a||"").localeCompare(b||"","ja"),n=v=>v==null?99999:Number(v),likes=c=>(c.likes?.mako?1:0)+(c.likes?.nae?1:0);
 const f={created_desc:(a,b)=>new Date(b.created_at)-new Date(a.created_at),created_asc:(a,b)=>new Date(a.created_at)-new Date(b.created_at),reading_asc:(a,b)=>txt(a.reading,b.reading),reading_desc:(a,b)=>txt(b.reading,a.reading),strokes_asc:(a,b)=>n(a.stroke_total)-n(b.stroke_total),strokes_desc:(a,b)=>n(b.stroke_total)-n(a.stroke_total),chars_asc:(a,b)=>n(a.char_count)-n(b.char_count),chars_desc:(a,b)=>n(b.char_count)-n(a.char_count),likes_desc:(a,b)=>likes(b)-likes(a)||new Date(b.created_at)-new Date(a.created_at),proposer_asc:(a,b)=>txt(a.actor,b.actor)};
 return a.sort(f[s]);
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
  n.querySelector(".memo").textContent=c.memo||"";n.querySelector(".meaning").textContent=c.meaning||"—";n.querySelector(".nanori").textContent=c.nanori||"—";n.querySelector(".stroke-order").textContent=c.stroke_order||"—";
  const ss=n.querySelector(".status-select");ss.value=c.status||"candidate";ss.onchange=()=>setStatus(c,ss.value);
  const vm=n.querySelector(".vote-mako"),vn=n.querySelector(".vote-nae");vm.classList.toggle("on",!!c.likes?.mako);vn.classList.toggle("on",!!c.likes?.nae);vm.textContent=`${c.likes?.mako?"★":"☆"} まこしゃ`;vn.textContent=`${c.likes?.nae?"★":"☆"} なえちゃ`;vm.onclick=()=>toggleLike(c,"mako");vn.onclick=()=>toggleLike(c,"nae");
  n.querySelector(".created").textContent=`${fmt(c.created_at)} ・ ${c.actor||"家族"}`;n.querySelector(".delete").onclick=()=>delCandidate(c);
  const ca=n.querySelector(".compare-add");ca.textContent=state.compare.includes(c.id)?"比較から外す":"比較に追加";ca.onclick=()=>toggleCompare(c);
  n.querySelector(".edit").onclick=()=>openEdit(c);
  const cl=n.querySelector(".comment-list");state.comments.filter(x=>x.candidate_id===c.id).forEach(cm=>{let d=document.createElement("div");d.className="comment";d.innerHTML=`<div class="comment-meta">${esc(cm.actor)} ・ ${esc(fmt(cm.created_at))}</div>${esc(cm.comment)}`;cl.appendChild(d)});
  const ci=n.querySelector(".comment-input");n.querySelector(".comment-add").onclick=()=>addComment(c,ci);list.appendChild(n);
 });
 const hl=$("#historyList");hl.innerHTML="";$("#historyCount").textContent=`(${state.history.length})`;
 state.history.forEach(h=>{let d=document.createElement("div");d.className="history-item";let own=h.owner_device_id===state.user.id;d.innerHTML=`<div class="history-row"><div><strong>${esc(h.action)}</strong>　文谷 ${esc(h.candidate_name)}<div class="history-meta">${esc(fmt(h.created_at))} ・ ${esc(h.actor)}${h.detail?" ・ "+esc(h.detail):""}</div></div>${own?'<button class="history-delete secondary">自分の履歴を削除</button>':""}</div>`;if(own)d.querySelector(".history-delete").onclick=()=>deleteHistory(h);hl.appendChild(d)});
 renderCompare();
}
function preview(){ $("#previewName").textContent=`文谷　${$("#nameInput").value.trim()||"——"}`;$("#previewReading").textContent=`ぶんや　${$("#readingInput").value.trim()||"——"}`}

$("#loginBtn").onclick=login;
$("#loginPassword").addEventListener("keydown",e=>{if(e.key==="Enter")login()});
$("#logoutBtn").onclick=logout;

const autoStrokeAdd=debounce(()=>fetchStrokeInfo($("#nameInput").value,$("#strokesInput"),$("#strokeStatus")),450);
const autoStrokeEdit=debounce(()=>fetchStrokeInfo($("#editName").value,$("#editStrokes"),$("#editStrokeStatus")),450);

$("#nameInput").oninput=()=>{preview();$("#strokesInput").readOnly=true;autoStrokeAdd()};
$("#readingInput").oninput=preview;
$("#manualStrokeBtn").onclick=()=>enableManualStroke($("#strokesInput"),$("#strokeStatus"));
$("#tagsInput").oninput=()=>renderTagSuggestions($("#tagSuggestions"),$("#tagsInput"));

$("#editName").oninput=()=>{$("#editStrokes").readOnly=true;autoStrokeEdit()};
$("#editManualStrokeBtn").onclick=()=>enableManualStroke($("#editStrokes"),$("#editStrokeStatus"));
$("#editTags").oninput=()=>renderTagSuggestions($("#editTagSuggestions"),$("#editTags"));
$("#saveEditBtn").onclick=saveEdit;
$("#closeEditBtn").onclick=()=>{state.editing=null;$("#editDialog").close()};

$("#addBtn").onclick=addCandidate;$("#searchInput").oninput=render;$("#sortSelect").onchange=render;$("#statusFilter").onchange=render;
$("#clearCompareBtn").onclick=()=>{state.compare=[];storage.set("babyma_compare",[]);render()};
$("#settingsBtn").onclick=()=>$("#settingsDialog").showModal();$("#closeSettingsBtn").onclick=()=>$("#settingsDialog").close();
$("#saveSettingsBtn").onclick=()=>{state.actor=$("#actorInput").value.trim();storage.set("babyma_actor",state.actor);$("#settingsDialog").close();render()};
init();
