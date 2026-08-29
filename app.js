
const $=s=>document.querySelector(s);
const storage={get(k,d){try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},set(k,v){localStorage.setItem(k,JSON.stringify(v))}};
const cfg=window.BABYMA_CONFIG||{};
let sb=null;
const state={candidates:[],history:[],comments:[],kanjiStocks:[],compare:[],actor:"",role:"mako",user:null,editing:null,kanjiCache:{},legalSets:null,dictionarySelected:null};
const ROOM="BABYMA";
const APP_VERSION="5.3.1";
const now=()=>new Date().toISOString();
const fmt=i=>new Intl.DateTimeFormat("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(i));
const count=s=>[...(s||"")].length;
const strokeTotal=s=>{const n=(s||"").match(/\d+/g);return n?n.map(Number).reduce((a,b)=>a+b,0):null};
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const statusName=s=>({candidate:"候補",hold:"保留",rejected:"却下"}[s]||"候補");
const isKanji=ch=>/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u.test(ch);
const debounce=(fn,ms=500)=>{let t;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),ms)}};

const HIRA_STROKES={"あ":3,"い":2,"う":2,"え":3,"お":4,"か":3,"き":4,"く":1,"け":3,"こ":2,"さ":3,"し":1,"す":3,"せ":3,"そ":4,"た":4,"ち":3,"つ":1,"て":2,"と":2,"な":5,"に":3,"ぬ":3,"ね":4,"の":1,"は":4,"ひ":2,"ふ":4,"へ":1,"ほ":5,"ま":4,"み":3,"む":4,"め":2,"も":3,"や":3,"ゆ":3,"よ":3,"ら":3,"り":2,"る":3,"れ":3,"ろ":2,"わ":3,"ゐ":3,"ゑ":5,"を":4,"ん":2};
const KATA_STROKES={"ア":2,"イ":2,"ウ":3,"エ":3,"オ":3,"カ":2,"キ":3,"ク":2,"ケ":3,"コ":2,"サ":3,"シ":3,"ス":2,"セ":2,"ソ":2,"タ":3,"チ":3,"ツ":3,"テ":3,"ト":2,"ナ":2,"ニ":2,"ヌ":2,"ネ":4,"ノ":1,"ハ":2,"ヒ":2,"フ":1,"ヘ":1,"ホ":4,"マ":2,"ミ":3,"ム":2,"メ":2,"モ":3,"ヤ":2,"ユ":2,"ヨ":3,"ラ":2,"リ":2,"ル":2,"レ":1,"ロ":3,"ワ":2,"ヰ":4,"ヱ":3,"ヲ":3,"ン":2};
const SMALL_KANA={"ぁ":"あ","ぃ":"い","ぅ":"う","ぇ":"え","ぉ":"お","ゃ":"や","ゅ":"ゆ","ょ":"よ","っ":"つ","ゎ":"わ","ァ":"ア","ィ":"イ","ゥ":"ウ","ェ":"エ","ォ":"オ","ャ":"ヤ","ュ":"ユ","ョ":"ヨ","ッ":"ツ","ヮ":"ワ"};
const VOICED={"が":"か","ぎ":"き","ぐ":"く","げ":"け","ご":"こ","ざ":"さ","じ":"し","ず":"す","ぜ":"せ","ぞ":"そ","だ":"た","ぢ":"ち","づ":"つ","で":"て","ど":"と","ば":"は","び":"ひ","ぶ":"ふ","べ":"へ","ぼ":"ほ","ゔ":"う","ガ":"カ","ギ":"キ","グ":"ク","ゲ":"ケ","ゴ":"コ","ザ":"サ","ジ":"シ","ズ":"ス","ゼ":"セ","ゾ":"ソ","ダ":"タ","ヂ":"チ","ヅ":"ツ","デ":"テ","ド":"ト","バ":"ハ","ビ":"ヒ","ブ":"フ","ベ":"ヘ","ボ":"ホ","ヴ":"ウ"};
const SEMIVOICED={"ぱ":"は","ぴ":"ひ","ぷ":"ふ","ぺ":"へ","ぽ":"ほ","パ":"ハ","ピ":"ヒ","プ":"フ","ペ":"ヘ","ポ":"ホ"};
function kanaStroke(ch){if(ch==="ー")return 1;const n=SMALL_KANA[ch]||ch;if(HIRA_STROKES[n]!=null)return HIRA_STROKES[n];if(KATA_STROKES[n]!=null)return KATA_STROKES[n];if(VOICED[ch]){const base=VOICED[ch];return (HIRA_STROKES[base]??KATA_STROKES[base])+2}if(SEMIVOICED[ch]){const base=SEMIVOICED[ch];return (HIRA_STROKES[base]??KATA_STROKES[base])+1}return null;}

function parseTags(value){
 return [...new Set((value||"").split(",").map(x=>x.trim()).filter(Boolean))];
}
function allTags(extra=[]){
 return [...new Set([...state.candidates.flatMap(c=>c.tags||[]),...extra])].sort((a,b)=>a.localeCompare(b,"ja"));
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
 allTags(current).forEach(tag=>{
   const btn=document.createElement("button");btn.type="button";btn.className="tag-suggestion"+(current.includes(tag)?" selected":"");btn.textContent=(current.includes(tag)?"✓ ":"#")+tag;
   btn.onclick=()=>{toggleTagInput(input,tag);renderTagSuggestions(container,input)};container.appendChild(btn);
 });
}
function addManualTag(input,newInput,container){
 const tag=newInput.value.trim().replace(/^#/,"");if(!tag)return;const tags=parseTags(input.value);if(!tags.includes(tag))tags.push(tag);input.value=tags.join(",");newInput.value="";renderTagSuggestions(container,input);
}

async function fetchStrokeInfo(name,input,statusEl){
 const chars=[...(name||"").trim()];
 if(!chars.length){input.value="";input.dataset.total="";statusEl.textContent="名前を入力すると自動取得しま（漢字・かな対応）";return null}
 statusEl.textContent="画数を取得中…";
 try{const rows=[];for(const ch of chars){const ks=kanaStroke(ch);if(ks!=null){rows.push({ch,strokes:ks});continue}if(isKanji(ch)){const r=await fetch("https://kanjiapi.dev/v1/kanji/"+encodeURIComponent(ch));if(!r.ok)throw new Error(ch);const j=await r.json();rows.push({ch,strokes:j.stroke_count});continue}throw new Error(ch)}
 const total=rows.reduce((n,x)=>n+x.strokes,0);input.value=rows.map(x=>x.strokes).join("+");input.dataset.total=String(total);statusEl.textContent=rows.map(x=>`${x.ch} ${x.strokes}画`).join(" ／ ")+` → 合計 ${total}画`;return total;
 }catch(e){input.value="";input.dataset.total="";statusEl.textContent=`「${e.message||"一部の文字"}」の画数を自動取得できなま。手入力を使ってま`;return null}
}
function enableManualStroke(input,statusEl){
 input.readOnly=false;input.focus();statusEl.textContent="手入力モードま";
}



const RATING_KEYS=["sound","surname","meaning","writing","calling"];
const ratingOptions=()=>'<option value="">—</option>'+[1,2,3,4,5].map(n=>`<option value="${n}">${"★".repeat(n)}</option>`).join("");

async function getLegalSets(){
 if(state.legalSets)return state.legalSets;
 const cached=storage.get("babyma_legal_kanji",null);
 if(cached?.joyo?.length && cached?.jinmeiyo?.length){
   state.legalSets={joyo:new Set(cached.joyo),jinmeiyo:new Set(cached.jinmeiyo)};
   return state.legalSets;
 }
 try{
   const [a,b]=await Promise.all([
     fetch("https://kanjiapi.dev/v1/kanji/joyo").then(r=>r.json()),
     fetch("https://kanjiapi.dev/v1/kanji/jinmeiyo").then(r=>r.json())
   ]);
   storage.set("babyma_legal_kanji",{joyo:a,jinmeiyo:b});
   state.legalSets={joyo:new Set(a),jinmeiyo:new Set(b)};
   return state.legalSets;
 }catch(e){return null}
}
async function getKanjiDetail(ch){
 if(state.kanjiCache[ch])return state.kanjiCache[ch];
 try{
   const r=await fetch("https://kanjiapi.dev/v1/kanji/"+encodeURIComponent(ch));
   if(!r.ok)throw new Error(ch);
   const j=await r.json();state.kanjiCache[ch]=j;return j;
 }catch(e){return null}
}
async function renderLegalAndKanjiInfo(c,root){
 const status=root.querySelector(".legal-status");
 const info=root.querySelector(".kanji-auto-info");
 const chars=[...c.name],kanji=chars.filter(isKanji);
 const sets=await getLegalSets();

 if(!kanji.length){
   status.textContent="✓ 漢字なし（かな名）";status.className="legal-status ok";
   info.innerHTML='<div class="kanji-info-item">漢字は含まれてなま。かなの画数は姓名判断用の設定で計算しま。</div>';
   return;
 }

 if(sets){
   const unusable=kanji.filter(ch=>!sets.joyo.has(ch)&&!sets.jinmeiyo.has(ch));
   if(unusable.length){
     status.textContent=`⚠ 使用可否を要確認：${unusable.join("・")}`;status.className="legal-status ng";
   }else{
     status.textContent="✓ 漢字はすべて子の名に使用可能";status.className="legal-status ok";
   }
 }else{
   status.textContent="使用可能文字の確認に失敗";status.className="legal-status checking";
 }

 const details=await Promise.all(kanji.map(getKanjiDetail));
 info.innerHTML="";
 details.forEach((d,i)=>{
   const ch=kanji[i],box=document.createElement("div");box.className="kanji-info-item";
   if(!d){box.textContent=`${ch}：辞書情報を取得できなま`;info.appendChild(box);return}
   const kind=sets ? (sets.jinmeiyo.has(ch)?"人名用漢字":sets.joyo.has(ch)?"常用漢字":"要確認") : "";
   const on=(d.on_readings||[]).join("・")||"—";
   const kun=(d.kun_readings||[]).join("・")||"—";
   const names=(d.name_readings||[]).join("・")||"—";
   const meanings=(d.meanings||[]).slice(0,5).join(", ")||"—";
   box.innerHTML=`<span class="kanji-char">${esc(ch)}</span>${kind?`<span class="kanji-type">${esc(kind)}</span>`:""}
   <div>画数：${d.stroke_count??"—"}画</div>
   <div>音読み：${esc(on)}</div><div>訓読み：${esc(kun)}</div>
   <div>名乗り：${esc(names)}</div><div>辞書意味（英語）：${esc(meanings)}</div>`;
   info.appendChild(box);
 });
}
function renderCallPreview(c,root){
 const box=root.querySelector(".call-chips");box.innerHTML="";
 [`${c.reading}くん`,`${c.reading}ちゃん`,`${c.reading}さん`,`文谷${c.name}です`].forEach(t=>{
   const x=document.createElement("span");x.className="call-chip";x.textContent=t;box.appendChild(x);
 });
}
function candidateHistory(c){
 return state.history.filter(h=>h.candidate_id===c.id || (!h.candidate_id && h.candidate_name===c.name && h.candidate_reading===c.reading));
}
function renderCandidateHistory(c,root){
 const box=root.querySelector(".candidate-history"),rows=candidateHistory(c);box.innerHTML="";
 if(!rows.length){box.innerHTML='<div class="hint">この候補の履歴はまだなま。</div>';return}
 rows.forEach(h=>{
   const x=document.createElement("div");x.className="candidate-history-item";
   x.innerHTML=`<strong>${esc(h.action)}</strong>${h.detail?`　${esc(h.detail)}`:""}<div class="candidate-history-meta">${esc(fmt(h.created_at))} ・ ${esc(h.actor||"")}</div>`;
   box.appendChild(x);
 });
}
function ratingsFor(c,role){return role==="mako"?(c.ratings_mako||{}):(c.ratings_nae||{})}
function renderRatings(c,root){
 const mako=ratingsFor(c,"mako"),nae=ratingsFor(c,"nae");
 root.querySelectorAll(".rating-row").forEach(row=>{
   const key=row.dataset.key,sm=row.querySelector(".rating-mako"),sn=row.querySelector(".rating-nae");
   sm.innerHTML=ratingOptions();sn.innerHTML=ratingOptions();
   sm.value=mako[key]??"";sn.value=nae[key]??"";
   sm.disabled=state.role!=="mako";sn.disabled=state.role!=="nae";
   sm.onchange=()=>saveRating(c,"mako",key,sm.value);
   sn.onchange=()=>saveRating(c,"nae",key,sn.value);
 });
}
async function saveRating(c,role,key,value){
 if(state.role!==role)return;
 const field=role==="mako"?"ratings_mako":"ratings_nae";
 const obj={...(c[field]||{})};
 if(value==="")delete obj[key];else obj[key]=Number(value);
 const {error}=await sb.from("name_candidates").update({[field]:obj}).eq("id",c.id);
 if(error){alert(error.message);return}
 await history("5段階評価",c,`${role==="mako"?"まこしゃ":"なえちゃ"}：${key}=${value||"未評価"}`);
 await refresh();
}


let toastTimer=null;
function showToast(message,ms=2200){
 const t=$("#appToast");if(!t)return;
 t.textContent=message;t.hidden=false;clearTimeout(toastTimer);
 toastTimer=setTimeout(()=>{t.hidden=true},ms);
}
async function fetchLatestVersion(){
 const url=new URL("./version.json",location.href);
 url.searchParams.set("_",Date.now().toString());
 const r=await fetch(url.toString(),{cache:"no-store",headers:{"Cache-Control":"no-cache"}});
 if(!r.ok)throw new Error("version check failed");
 return await r.json();
}
async function clearAppCaches(){
 try{
  if("caches" in window){
   const keys=await caches.keys();
   await Promise.all(keys.map(k=>caches.delete(k)));
  }
 }catch(e){console.warn(e)}
}
function reloadWithVersion(version){
 const url=new URL(location.href);
 url.searchParams.set("v",version);
 url.searchParams.set("_",Date.now().toString());
 location.replace(url.toString());
}
async function updateApp(forceReload=false){
 const btn=$("#refreshAppBtn");
 if(btn){btn.classList.add("updating");btn.textContent="↻ 確認中…"}
 try{
  const latest=await fetchLatestVersion();
  if(forceReload||latest.version!==APP_VERSION){
   showToast(`v${latest.version} に更新しま！`,1200);
   await clearAppCaches();
   setTimeout(()=>reloadWithVersion(latest.version),350);
   return;
  }
  showToast(`最新版 v${APP_VERSION} ま！`);
  if(state.user)await refresh();
 }catch(e){
  console.error(e);showToast("更新確認できなま。通信状態を確認してま",3000);
 }finally{
  if(btn){btn.classList.remove("updating");btn.textContent="↻ 更新"}
 }
}
async function silentVersionCheck(){
 try{
  const latest=await fetchLatestVersion();
  if(latest.version!==APP_VERSION){
   const btn=$("#refreshAppBtn");
   if(btn)btn.textContent=`↻ v${latest.version}あり`;
  }
 }catch(e){}
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
 state.role=storage.get("babyma_role","mako");
 $("#actorInput").value=state.actor;$("#roleInput").value=state.role;
 $("#signedInAs").textContent=`ログイン中：${user.email||""}`;
 showApp();
 if(!state.actor) $("#settingsDialog").showModal();
 await refresh();
 silentVersionCheck();
}
async function logout(){
 await sb.auth.signOut();
 state.candidates=[];state.history=[];state.comments=[];state.kanjiStocks=[];
 showAuth("ログアウトしまし。");
}
async function refresh(retry=0){
 const [a,b,c,d]=await Promise.all([
  sb.from("name_candidates").select("*").eq("room_code",ROOM).order("created_at",{ascending:false}),
  sb.from("name_history").select("*").eq("room_code",ROOM).order("created_at",{ascending:false}),
  sb.from("name_comments").select("*").eq("room_code",ROOM).order("created_at",{ascending:true}),
  sb.from("kanji_stocks").select("*").eq("room_code",ROOM).order("created_at",{ascending:false})
 ]);
 const err=a.error||b.error||c.error||d.error;
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
 state.candidates=(a.data||[]).map(x=>({...x,ratings_mako:x.ratings_mako||{},ratings_nae:x.ratings_nae||{},likes:{mako:!!x.like_mako,nae:!!x.like_nae}}));
 state.history=b.data||[];state.comments=c.data||[];state.kanjiStocks=d.data||[];
 state.compare=storage.get("babyma_compare",[]);
 render();renderKanjiStocks();renderDictionary();
 renderTagSuggestions($("#tagSuggestions"),$("#tagsInput"));
}
async function history(action,c,detail=""){
 const row={room_code:ROOM,actor:state.actor||state.user?.email||"家族",owner_device_id:state.user.id,candidate_id:c?.id||null,action,candidate_name:c?.name||"",candidate_reading:c?.reading||"",detail};
 const {error}=await sb.from("name_history").insert(row);if(error)throw error;
}
async function addCandidate(){
 if(!state.actor){$("#settingsDialog").showModal();return}
 const name=$("#nameInput").value.trim(),reading=$("#readingInput").value.trim();if(!name||!reading){alert("名前と読みを入れてま！");return}
 const tags=parseTags($("#tagsInput").value);
 const autoTotal=$("#strokesInput").dataset.total ? Number($("#strokesInput").dataset.total) : strokeTotal($("#strokesInput").value);
 const row={room_code:ROOM,name,reading,strokes_text:$("#strokesInput").value.trim(),stroke_total:autoTotal,char_count:count(name),memo:$("#memoInput").value.trim(),tags,actor:state.actor,owner_device_id:state.user.id,status:"candidate",meaning:$("#meaningInput").value.trim(),nanori:$("#nanoriInput").value.trim(),stroke_order:$("#strokeOrderInput").value.trim(),like_mako:false,like_nae:false,ratings_mako:{},ratings_nae:{}};
 const {data,error}=await sb.from("name_candidates").insert(row).select().single();
 if(error){alert(error.message);return}
 await history("候補追加",data);await refresh();
 ["#nameInput","#readingInput","#strokesInput","#tagsInput","#memoInput","#meaningInput","#nanoriInput","#strokeOrderInput"].forEach(s=>$(s).value="");
 $("#strokesInput").dataset.total="";$("#strokesInput").readOnly=true;$("#strokeStatus").textContent="名前を入力すると自動取得しま（漢字・かな対応）";
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
 $("#editTags").value=(c.tags||[]).join(",");$("#editNewTagInput").value="";
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


function kanjiKinds(ch,sets){return sets?{joyo:sets.joyo.has(ch),jinmeiyo:sets.jinmeiyo.has(ch)}:{joyo:false,jinmeiyo:false}}
function kindBadgesHtml(ch,sets){const k=kanjiKinds(ch,sets);let h="";if(k.joyo)h+='<span class="kind-badge kind-joyo">常用漢字</span>';if(k.jinmeiyo)h+='<span class="kind-badge kind-jinmeiyo">人名用漢字</span>';if(!k.joyo&&!k.jinmeiyo)h+='<span class="kind-badge kind-check">要確認</span>';return h}
async function saveStockMemo(x,role,input){const field=role==="mako"?"memo_mako":"memo_nae";const {error}=await sb.from("kanji_stocks").update({[field]:input.value.trim()}).eq("id",x.id);if(error){alert(error.message);return}await refresh()}
async function renderDictionary(){
 const grid=$("#dictionaryGrid"),status=$("#dictionaryStatus"),sets=await getLegalSets();if(!sets){status.textContent="漢字一覧を取得できなま";return}
 let rows=[...[...sets.joyo].map(ch=>({ch,type:"joyo"})),...[...sets.jinmeiyo].filter(ch=>!sets.joyo.has(ch)).map(ch=>({ch,type:"jinmeiyo"}))];
 const q=$("#dictionarySearch").value.trim(),type=$("#dictionaryTypeFilter").value,sort=$("#dictionarySort").value;if(q)rows=rows.filter(x=>x.ch===q);if(type!=="all")rows=rows.filter(x=>x.type===type);
 if(sort==="char")rows.sort((a,b)=>a.ch.localeCompare(b.ch,"ja"));else rows.sort((a,b)=>a.type===b.type?a.ch.localeCompare(b.ch,"ja"):(a.type==="joyo"?-1:1));
 $("#dictionaryCount").textContent=`${rows.length}字`;status.textContent=`${rows.length}字を表示`;grid.innerHTML="";
 const frag=document.createDocumentFragment();rows.forEach(x=>{const b=document.createElement("button");b.type="button";b.className=`dictionary-char ${x.type}`;b.textContent=x.ch;b.onclick=()=>openDictionaryDetail(x.ch);frag.appendChild(b)});grid.appendChild(frag)
}
async function openDictionaryDetail(ch){state.dictionarySelected=ch;$("#dictionaryDetail").hidden=false;$("#dictionaryDetailChar").textContent=ch;const sets=await getLegalSets();$("#dictionaryDetailType").innerHTML=kindBadgesHtml(ch,sets);const info=$("#dictionaryDetailInfo");info.textContent="読み込み中…";const d=await getKanjiDetail(ch);if(!d){info.textContent="辞書情報を取得できなま";return}info.innerHTML=`<div>画数：${d.stroke_count??"—"}画</div><div>音読み：${esc((d.on_readings||[]).join("・")||"—")}</div><div>訓読み：${esc((d.kun_readings||[]).join("・")||"—")}</div><div>名乗り：${esc((d.name_readings||[]).join("・")||"—")}</div><div>意味：${esc((d.meanings||[]).join(", ")||"—")}</div>`}
async function addDictionarySelectedToStock(){const ch=state.dictionarySelected;if(!ch)return;if(state.kanjiStocks.some(x=>x.kanji===ch)){showToast(`${ch} はもうストック済みま！`);return}const d=await getKanjiDetail(ch);const row={room_code:ROOM,kanji:ch,stroke_count:d?.stroke_count??null,on_readings:d?.on_readings||[],kun_readings:d?.kun_readings||[],name_readings:d?.name_readings||[],meanings:d?.meanings||[],memo_mako:"",memo_nae:"",actor:state.actor||state.user?.email||"家族",owner_user_id:state.user.id};const {error}=await sb.from("kanji_stocks").insert(row);if(error){alert(error.message);return}showToast(`${ch} をストックしまし！`);await refresh()}
async function addKanjiStock(){
 const ch=$("#kanjiStockInput").value.trim(),memo=$("#kanjiStockMemo").value.trim();
 if(!ch){alert("漢字を1文字入れてま！");return}
 if([...ch].length!==1||!isKanji(ch)){alert("漢字1文字を入れてま！");return}
 if(state.kanjiStocks.some(x=>x.kanji===ch)){alert(`${ch} はもうストック済みま！`);return}
 const d=await getKanjiDetail(ch);
 const row={room_code:ROOM,kanji:ch,stroke_count:d?.stroke_count??null,on_readings:d?.on_readings||[],kun_readings:d?.kun_readings||[],name_readings:d?.name_readings||[],meanings:d?.meanings||[],memo_mako:state.role==="mako"?memo:"",memo_nae:state.role==="nae"?memo:"",actor:state.actor||state.user?.email||"家族",owner_user_id:state.user.id};
 const {error}=await sb.from("kanji_stocks").insert(row);if(error){alert(error.message);return}
 $("#kanjiStockInput").value="";$("#kanjiStockMemo").value="";await refresh();
}
async function deleteKanjiStock(x){
 if(!confirm(`${x.kanji} を漢字ストックから外しま？`))return;
 const {error}=await sb.from("kanji_stocks").delete().eq("id",x.id);if(error){alert(error.message);return}
 await refresh();
}
function sendKanjiToCandidate(x){
 $("#nameInput").value=x.kanji;preview();$("#nameInput").dispatchEvent(new Event("input"));
 window.scrollTo({top:$("#nameInput").getBoundingClientRect().top+window.scrollY-120,behavior:"smooth"});
 $("#readingInput").focus();
}
async function renderKanjiStocks(){
 const list=$("#kanjiStockList"),empty=$("#kanjiStockEmpty");list.innerHTML="";$("#kanjiStockCount").textContent=`${state.kanjiStocks.length}字`;empty.hidden=state.kanjiStocks.length>0;const sets=await getLegalSets();
 state.kanjiStocks.forEach(x=>{const card=document.createElement("article");card.className="kanji-stock-card";const on=(x.on_readings||[]).join("・")||"—",kun=(x.kun_readings||[]).join("・")||"—",names=(x.name_readings||[]).join("・")||"—",meanings=(x.meanings||[]).slice(0,4).join(", ")||"—",m=x.memo_mako||"",n=x.memo_nae||"";
 card.innerHTML=`<div class="kanji-stock-char">${esc(x.kanji)}</div><div class="kanji-kind-badges">${kindBadgesHtml(x.kanji,sets)}</div><div class="kanji-stock-meta">${x.stroke_count??"—"}画 ・ ${esc(x.actor||"家族")} ・ ${esc(fmt(x.created_at))}</div><div class="kanji-stock-info"><div>音：${esc(on)}</div><div>訓：${esc(kun)}</div><div>名乗り：${esc(names)}</div><div>意味：${esc(meanings)}</div></div>
 <div class="stock-memo-grid"><div class="stock-memo-box"><div class="stock-memo-title">まこしゃメモ</div><div class="stock-memo-text">${esc(m)||"—"}</div>${state.role==="mako"?`<div class="stock-memo-edit"><input class="memo-mako-input" maxlength="120" value="${esc(m)}"><button class="secondary memo-mako-save">保存</button></div>`:""}</div><div class="stock-memo-box"><div class="stock-memo-title">なえちゃメモ</div><div class="stock-memo-text">${esc(n)||"—"}</div>${state.role==="nae"?`<div class="stock-memo-edit"><input class="memo-nae-input" maxlength="120" value="${esc(n)}"><button class="secondary memo-nae-save">保存</button></div>`:""}</div></div>
 <div class="kanji-stock-actions"><button class="secondary stock-use">名前候補に使う</button><button class="secondary stock-delete">ストックから外す</button></div>`;
 card.querySelector(".stock-use").onclick=()=>sendKanjiToCandidate(x);card.querySelector(".stock-delete").onclick=()=>deleteKanjiStock(x);const mi=card.querySelector(".memo-mako-input"),ms=card.querySelector(".memo-mako-save");if(mi&&ms)ms.onclick=()=>saveStockMemo(x,"mako",mi);const ni=card.querySelector(".memo-nae-input"),ns=card.querySelector(".memo-nae-save");if(ni&&ns)ns.onclick=()=>saveStockMemo(x,"nae",ni);list.appendChild(card)});
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
  const ci=n.querySelector(".comment-input");n.querySelector(".comment-add").onclick=()=>addComment(c,ci);
  const card=n.querySelector(".candidate");
  renderCallPreview(c,card);renderRatings(c,card);renderCandidateHistory(c,card);
  list.appendChild(n);
  renderLegalAndKanjiInfo(c,list.lastElementChild);
 });
 const hl=$("#historyList");hl.innerHTML="";$("#historyCount").textContent=`(${state.history.length})`;
 state.history.forEach(h=>{let d=document.createElement("div");d.className="history-item";let own=h.owner_device_id===state.user.id;d.innerHTML=`<div class="history-row"><div><strong>${esc(h.action)}</strong>　文谷 ${esc(h.candidate_name)}<div class="history-meta">${esc(fmt(h.created_at))} ・ ${esc(h.actor)}${h.detail?" ・ "+esc(h.detail):""}</div></div>${own?'<button class="history-delete secondary">自分の履歴を削除</button>':""}</div>`;if(own)d.querySelector(".history-delete").onclick=()=>deleteHistory(h);hl.appendChild(d)});
 renderCompare();
}
function preview(){ $("#previewName").textContent=`文谷　${$("#nameInput").value.trim()||"——"}`;$("#previewReading").textContent=`ぶんや　${$("#readingInput").value.trim()||"——"}`}

if($("#refreshAppBtn")) $("#refreshAppBtn").onclick=()=>updateApp(false);
$("#loginBtn").onclick=login;
$("#loginPassword").addEventListener("keydown",e=>{if(e.key==="Enter")login()});
$("#logoutBtn").onclick=logout;

const autoStrokeAdd=debounce(()=>fetchStrokeInfo($("#nameInput").value,$("#strokesInput"),$("#strokeStatus")),450);
const autoStrokeEdit=debounce(()=>fetchStrokeInfo($("#editName").value,$("#editStrokes"),$("#editStrokeStatus")),450);

$("#nameInput").oninput=()=>{preview();$("#strokesInput").readOnly=true;autoStrokeAdd()};
$("#readingInput").oninput=preview;
$("#manualStrokeBtn").onclick=()=>enableManualStroke($("#strokesInput"),$("#strokeStatus"));
$("#addNewTagBtn").onclick=()=>addManualTag($("#tagsInput"),$("#newTagInput"),$("#tagSuggestions"));
$("#newTagInput").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();addManualTag($("#tagsInput"),$("#newTagInput"),$("#tagSuggestions"))}});

$("#editName").oninput=()=>{$("#editStrokes").readOnly=true;autoStrokeEdit()};
$("#editManualStrokeBtn").onclick=()=>enableManualStroke($("#editStrokes"),$("#editStrokeStatus"));
$("#editAddNewTagBtn").onclick=()=>addManualTag($("#editTags"),$("#editNewTagInput"),$("#editTagSuggestions"));
$("#editNewTagInput").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();addManualTag($("#editTags"),$("#editNewTagInput"),$("#editTagSuggestions"))}});
$("#saveEditBtn").onclick=saveEdit;
$("#closeEditBtn").onclick=()=>{state.editing=null;$("#editDialog").close()};

$("#dictionarySearch").oninput=renderDictionary;
$("#dictionaryTypeFilter").onchange=renderDictionary;
$("#dictionarySort").onchange=renderDictionary;
$("#closeDictionaryDetail").onclick=()=>{$("#dictionaryDetail").hidden=true;state.dictionarySelected=null};
$("#dictionaryAddStockBtn").onclick=addDictionarySelectedToStock;
$("#addKanjiStockBtn").onclick=addKanjiStock;
$("#kanjiStockInput").addEventListener("keydown",e=>{if(e.key==="Enter")addKanjiStock()});
$("#addBtn").onclick=addCandidate;$("#searchInput").oninput=render;$("#sortSelect").onchange=render;$("#statusFilter").onchange=render;
$("#clearCompareBtn").onclick=()=>{state.compare=[];storage.set("babyma_compare",[]);render()};
$("#updatesBtn").onclick=()=>$("#updatesDialog").showModal();
$("#closeUpdatesBtn").onclick=()=>$("#updatesDialog").close();
$("#settingsBtn").onclick=()=>$("#settingsDialog").showModal();$("#closeSettingsBtn").onclick=()=>$("#settingsDialog").close();
$("#saveSettingsBtn").onclick=()=>{state.actor=$("#actorInput").value.trim();state.role=$("#roleInput").value;storage.set("babyma_actor",state.actor);storage.set("babyma_role",state.role);$("#settingsDialog").close();render()};
init();
