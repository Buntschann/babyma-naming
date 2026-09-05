const APP_VERSION="1.13.0";const VERSION_URL="./version.json";const HISTORY_URL="./update-history.json";const cfg=window.APP_CONFIG||{};const configured=cfg.SUPABASE_URL&&cfg.SUPABASE_PUBLISHABLE_KEY&&cfg.SHARED_AUTH_EMAIL&&!String(cfg.SUPABASE_URL).includes("YOUR_")&&!String(cfg.SUPABASE_PUBLISHABLE_KEY).includes("YOUR_");const $=id=>document.getElementById(id);let sb=null,library=[],scanner=null,operatorName=localStorage.getItem("ib_operator_name")||"";$('currentVersionText').textContent=`v${APP_VERSION}`;


const SCORE_TAG_DEFAULTS={
  voicing:["混声4部","混声3部","女声3部","女声2部","男声4部","男声3部","同声2部","同声3部","SATB","SAB","SSA","SSAA","TTBB","ユニゾン","div.","編成複数"],
  instrumentation:["無伴奏","伴奏あり","ピアノ","オルガン","フルート","ヴァイオリン","チェロ","弦楽合奏","管弦楽","吹奏楽","打楽器","その他伴奏"],
  language:["日本語","英語","ラテン語","ドイツ語","フランス語","イタリア語","スペイン語","ロシア語","中国語","韓国語"]
};
let scoreTagOptions={voicing:[],instrumentation:[],language:[]};
let peopleMaster=[];

function normalizePersonKey(name){
  return String(name||"")
    .normalize("NFKC")
    .replace(/[\s　・･,，、]/g,"")
    .toLowerCase();
}

async function loadPeopleMaster(){
  try{
    const {data,error}=await sb.from('people_master').select('*').order('name',{ascending:true});
    if(error){console.warn('people_master load failed',error);return}
    peopleMaster=data||[];
  }catch(err){console.warn('people_master load failed',err)}
}

function findPersonMaster(name,role){
  const key=normalizePersonKey(name);
  if(!key)return null;
  return peopleMaster.find(p=>{
    if(role && p.role!==role)return false;
    if(normalizePersonKey(p.name)===key)return true;
    return (p.aliases||[]).some(a=>normalizePersonKey(a)===key);
  })||null;
}

function autoFillPersonKana(nameId,kanaId,role){
  const name=$(nameId)?.value?.trim()||'';
  if(!name)return false;
  const hit=findPersonMaster(name,role);
  if(hit?.name_kana && !$(kanaId).value.trim()){
    $(kanaId).value=hit.name_kana;
    return true;
  }
  return false;
}

async function upsertPersonMaster(name,kana,role){
  name=String(name||'').trim();
  kana=String(kana||'').trim();
  if(!name)return;

  const existing=findPersonMaster(name,role);
  if(existing){
    const patch={updated_at:new Date().toISOString()};
    if(kana && !existing.name_kana)patch.name_kana=kana;
    if(Object.keys(patch).length>1){
      const {error}=await sb.from('people_master').update(patch).eq('id',existing.id);
      if(!error)Object.assign(existing,patch);
    }
    return;
  }

  const {data,error}=await sb.from('people_master')
    .insert({name,name_kana:kana||null,role,aliases:[]})
    .select('*').single();
  if(!error && data)peopleMaster.push(data);
}

async function autoFillScorePersonKana(){
  let changed=false;
  changed=autoFillPersonKana('fScoreComposer','fComposerKana','composer')||changed;
  changed=autoFillPersonKana('fLyricist','fLyricistKana','lyricist')||changed;
  if(changed)showToast('人物マスターから読みを補完しました');
}



function uniqTags(values){
  const out=[];const seen=new Set();
  for(const v of values||[]){
    const s=String(v||"").trim();
    const k=s.toLowerCase();
    if(s&&!seen.has(k)){seen.add(k);out.push(s)}
  }
  return out;
}
function selectedTagsFromHidden(id){
  const el=$(id);if(!el)return [];
  const raw=el.value||"";
  try{
    const v=JSON.parse(raw||"[]");
    return Array.isArray(v)?v:[];
  }catch{
    return String(raw).split(/[;；\n]+/).map(x=>x.trim()).filter(Boolean);
  }
}
function saveSelectedTags(id,values){
  $(id).value=JSON.stringify(uniqTags(values));
}
function collectUsedScoreTags(){
  const v=[],ins=[],lang=[];
  for(const item of library||[]){
    if(item.material_type!=="score" && item.media_type!=="楽譜")continue;
    v.push(...(item.voicing_tags||[]));
    ins.push(...(item.instrumentation_tags||[]));
    lang.push(...(item.language_tags||[]));
  }
  scoreTagOptions={
    voicing:uniqTags([...SCORE_TAG_DEFAULTS.voicing,...v]),
    instrumentation:uniqTags([...SCORE_TAG_DEFAULTS.instrumentation,...ins]),
    language:uniqTags([...SCORE_TAG_DEFAULTS.language,...lang])
  };
}
function renderTagPicker(kind){
  const map={
    voicing:{picker:"voicingTagPicker",hidden:"fVoicingTags"},
    instrumentation:{picker:"instrumentationTagPicker",hidden:"fInstrumentationTags"},
    language:{picker:"languageTagPicker",hidden:"fLanguageTags"}
  };
  const cfg=map[kind],box=$(cfg.picker);
  if(!cfg||!box||!$(cfg.hidden))return;
  const selected=new Set(selectedTagsFromHidden(cfg.hidden).map(x=>String(x).toLowerCase()));
  box.innerHTML="";
  const options=uniqTags([...(scoreTagOptions[kind]||[]),...selectedTagsFromHidden(cfg.hidden)]);
  if(!options.length){box.innerHTML='<span class="tag-empty">候補はまだありません</span>';return}
  options.forEach(tag=>{
    const b=document.createElement("button");
    b.type="button";b.className="tag-chip"+(selected.has(tag.toLowerCase())?" selected":"");b.textContent=tag;
    b.addEventListener("click",()=>{
      const current=selectedTagsFromHidden(cfg.hidden);
      const exists=current.some(x=>String(x).toLowerCase()===tag.toLowerCase());
      saveSelectedTags(cfg.hidden,exists?current.filter(x=>String(x).toLowerCase()!==tag.toLowerCase()):[...current,tag]);
      renderTagPicker(kind);
    });
    box.appendChild(b);
  });
}
function renderAllScoreTagPickers(){
  collectUsedScoreTags();
  renderTagPicker("voicing");renderTagPicker("instrumentation");renderTagPicker("language");
}
function addCustomScoreTag(kind,inputId){
  const map={voicing:"fVoicingTags",instrumentation:"fInstrumentationTags",language:"fLanguageTags"};
  const input=$(inputId);const tag=input.value.trim();if(!tag)return;
  const current=selectedTagsFromHidden(map[kind]);
  saveSelectedTags(map[kind],[...current,tag]);
  input.value="";
  collectUsedScoreTags();
  if(!scoreTagOptions[kind].some(x=>x.toLowerCase()===tag.toLowerCase()))scoreTagOptions[kind].push(tag);
  renderTagPicker(kind);
}

const PROVIDER_DEFAULTS={
  rakuten:true,
  musicbrainz:true,
  discogs:true,
  cdstub:true,
  upcitemdb:true
};
let providerAvailability={};
let providerSettings=loadProviderSettings();

function loadProviderSettings(){
  try{
    return {
      ...PROVIDER_DEFAULTS,
      ...JSON.parse(localStorage.getItem("ib_provider_settings")||"{}")
    };
  }catch{
    return {...PROVIDER_DEFAULTS};
  }
}
function saveProviderSettings(){
  localStorage.setItem("ib_provider_settings",JSON.stringify(providerSettings));
}

if(!configured){$('setupNotice').classList.remove('hidden')}else{const remember=localStorage.getItem('ib_remember_session')!=='false';sb=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:remember,autoRefreshToken:true,detectSessionInUrl:false}});init()}
async function init(){await checkForUpdate(false);const{data}=await sb.auth.getSession();if(data.session)enterAfterAuth()}
$('gateForm').addEventListener('submit',async e=>{e.preventDefault();$('gateMessage').textContent='確認しています…';const remember=$('rememberSession').checked;localStorage.setItem('ib_remember_session',String(remember));const{error}=await sb.auth.signInWithPassword({email:cfg.SHARED_AUTH_EMAIL,password:$('sharedPassword').value});$('sharedPassword').value='';if(error){$('gateMessage').textContent='パスワードが正しくありません。';return}$('gateMessage').textContent='';enterAfterAuth()});
function enterAfterAuth(){$('gateView').classList.add('hidden');$('settingsBtn').classList.remove('hidden');if(!operatorName){$('nameView').classList.remove('hidden');$('appView').classList.add('hidden')}else showApp()}
$('nameForm').addEventListener('submit',e=>{e.preventDefault();setOperator($('operatorNameInput').value.trim())});$('changeOperatorBtn').addEventListener('click',promptOperator);$('changeNameInSettings').addEventListener('click',()=>{closeSettings();promptOperator()});function promptOperator(){const name=prompt('入力者名を入力してください。',operatorName);if(name!==null&&name.trim())setOperator(name.trim())}function setOperator(name){operatorName=name;localStorage.setItem('ib_operator_name',name);$('nameView').classList.add('hidden');showApp()}function showApp(){$('appView').classList.remove('hidden');$('operatorNameDisplay').textContent=operatorName;$('fOperator').value=operatorName;loadLibrary()}
$('settingsBtn').addEventListener('click',()=>$('settingsModal').classList.remove('hidden'));$('closeSettingsBtn').addEventListener('click',closeSettings);function closeSettings(){$('settingsModal').classList.add('hidden')}$('logoutBtn').addEventListener('click',async()=>{await sb.auth.signOut();closeSettings();$('appView').classList.add('hidden');$('settingsBtn').classList.add('hidden');$('gateView').classList.remove('hidden')});
$('manualBtn').addEventListener('click',()=>openEditor({material_type:$('registrationMaterialType').value,media_type:$('registrationMaterialType').value==='score'?'楽譜':'CD'}));$('metadataSearchBtn').addEventListener('click',openMetadataSearch);$('closeMetadataSearchBtn').addEventListener('click',closeMetadataSearch);$('clearMetadataSearchBtn').addEventListener('click',()=>{$('metadataSearchForm').reset();$('metadataSearchResults').innerHTML='';$('metadataSearchStatus').textContent=''});$('metadataSearchForm').addEventListener('submit',searchMetadata);$('refreshBtn').addEventListener('click',loadLibrary);$('refreshLibraryBtn').addEventListener('click',loadLibrary);$('searchInput').addEventListener('input',renderLibrary);$('genreFilter').addEventListener('change',renderLibrary);$('materialFilter').addEventListener('change',renderLibrary);$('reviewFilter').addEventListener('change',renderLibrary);$('cancelEditBtn').addEventListener('click',()=>$('editorCard').classList.add('hidden'));$('deleteItemBtn').addEventListener('click',deleteCurrentItem);$('lookupBtn').addEventListener('click',()=>lookupBarcode($('barcodeInput').value.trim()));$('scanBtn').addEventListener('click',startScanner);$('stopScanBtn').addEventListener('click',stopScanner);
$('addVoicingTagBtn')?.addEventListener('click',()=>addCustomScoreTag('voicing','newVoicingTag'));
$('addInstrumentationTagBtn')?.addEventListener('click',()=>addCustomScoreTag('instrumentation','newInstrumentationTag'));
$('addLanguageTagBtn')?.addEventListener('click',()=>addCustomScoreTag('language','newLanguageTag'));
$('fScoreComposer')?.addEventListener('change',()=>autoFillPersonKana('fScoreComposer','fComposerKana','composer'));
$('fScoreComposer')?.addEventListener('blur',()=>autoFillPersonKana('fScoreComposer','fComposerKana','composer'));
$('fLyricist')?.addEventListener('change',()=>autoFillPersonKana('fLyricist','fLyricistKana','lyricist'));
$('fLyricist')?.addEventListener('blur',()=>autoFillPersonKana('fLyricist','fLyricistKana','lyricist'));

['newVoicingTag','newInstrumentationTag','newLanguageTag'].forEach(id=>{
  $(id)?.addEventListener('keydown',e=>{
    if(e.key==='Enter'){
      e.preventDefault();
      if(id==='newVoicingTag')addCustomScoreTag('voicing',id);
      if(id==='newInstrumentationTag')addCustomScoreTag('instrumentation',id);
      if(id==='newLanguageTag')addCustomScoreTag('language',id);
    }
  });
});

$('registrationMaterialType').addEventListener('change',updateRegistrationMode);
$('msMaterialType').addEventListener('change',updateMetadataSearchMode);
$('fMediaType')?.addEventListener('change',()=>{if($('fMediaType').value==='楽譜')setEditorMaterialType('score');});
function updateRegistrationMode(){
  const score=$('registrationMaterialType').value==='score';
  $('barcodeLabelText').textContent=score?'ISBN / JAN / EANコード':'JAN / EANコード';
  $('barcodeInput').placeholder=score?'例：9784117188076':'例：4988000000000';
}
function updateMetadataSearchMode(){
  const score=$('msMaterialType').value==='score';
  document.querySelectorAll('.score-search-field').forEach(x=>x.classList.toggle('hidden',!score));
  $('msCatalogNo').placeholder=score?'例：出版社品番':'例：UCCG-45001';
}
function setEditorMaterialType(type){
  const score=type==='score';
  $('fMaterialType').value=score?'score':'media';
  $('scoreFormSection').classList.toggle('hidden',!score);
  $('mediaFormSection').classList.toggle('hidden',score);
  $('enrichScoreBtn').classList.toggle('hidden',!score);
  if(score)renderAllScoreTagPickers();autoFillScorePersonKana();
}
updateRegistrationMode();updateMetadataSearchMode();
$('fScoreContents').addEventListener('input',updateScoreContentCount);
$('enrichScoreBtn').addEventListener('click',enrichCurrentScore);

function splitTags(v){return String(v||'').split(/[;；\n]+/).map(x=>x.trim()).filter(Boolean)}

function mergeSelectedTags(hiddenId,values){
  const merged=uniqTags([...(selectedTagsFromHidden(hiddenId)||[]),...(values||[])]);
  saveSelectedTags(hiddenId,merged);
}
function inferLanguageTagsFromText(text){
  const t=String(text||"");
  const out=[];
  const pairs=[
    ["日本語",/(?:歌詞|言語|text|lyrics?)\s*[：:]?\s*日本語|日本語(?:歌詞|テキスト)?|Japanese/i],
    ["英語",/(?:歌詞|言語|text|lyrics?)\s*[：:]?\s*英語|英語(?:歌詞|テキスト)?|English/i],
    ["ラテン語",/(?:歌詞|言語)\s*[：:]?\s*ラテン語|Latin/i],
    ["ドイツ語",/(?:歌詞|言語)\s*[：:]?\s*ドイツ語|German/i],
    ["フランス語",/(?:歌詞|言語)\s*[：:]?\s*フランス語|French/i],
    ["イタリア語",/(?:歌詞|言語)\s*[：:]?\s*イタリア語|Italian/i],
    ["スペイン語",/(?:歌詞|言語)\s*[：:]?\s*スペイン語|Spanish/i],
    ["ロシア語",/(?:歌詞|言語)\s*[：:]?\s*ロシア語|Russian/i],
    ["中国語",/(?:歌詞|言語)\s*[：:]?\s*中国語|Chinese/i],
    ["韓国語",/(?:歌詞|言語)\s*[：:]?\s*韓国語|Korean/i]
  ];
  for(const [name,re] of pairs)if(re.test(t))out.push(name);
  return uniqTags(out);
}
function parseScoreContents(text){
  return String(text||'').split(/\n+/).map(x=>x.trim()).filter(Boolean).map((line,i)=>{
    const p=line.split('|').map(x=>x.trim());
    const page=(p[4]||'').match(/\d+/);
    return {track_no:i+1,title:p[0]||'',composer:p[1]||null,lyricist:p[2]||null,arranger:p[3]||null,page_start:page?Number(page[0]):null};
  }).filter(x=>x.title)
}
function scoreContentsToText(rows){
  return (rows||[]).map(x=>{
    const vals=[x.title||'',x.composer||'',x.lyricist||'',x.arranger||'',x.page_start||''];
    while(vals.length>1 && !vals[vals.length-1])vals.pop();
    return vals.join(' | ');
  }).join('\n')
}
function updateScoreContentCount(){
  const n=parseScoreContents($('fScoreContents').value).length;
  $('scoreContentCount').textContent=n?`${n}曲`:'';
}
async function saveScoreContents(itemId){
  if(!itemId)return;
  const rows=parseScoreContents($('fScoreContents').value);
  const del=await sb.from('score_contents').delete().eq('library_item_id',itemId);
  if(del.error)throw del.error;
  if(rows.length){
    const ins=await sb.from('score_contents').insert(rows.map(r=>({...r,library_item_id:itemId})));
    if(ins.error)throw ins.error;
  }
}
function fillIfEmpty(id,value){
  if(value===undefined||value===null||value==='')return false;
  const el=$(id);if(!el||String(el.value||'').trim())return false;
  el.value=Array.isArray(value)?value.join('; '):value;return true;
}
async function enrichCurrentScore(){
  if($('fMaterialType').value!=='score')return;
  const btn=$('enrichScoreBtn');btn.disabled=true;btn.textContent='外部DBを探索中…';
  const search={materialType:'score',isbn:$('fIsbn').value.trim(),ismn:$('fIsmn').value.trim(),title:$('fScoreTitle').value.trim(),artist:$('fScoreComposer').value.trim(),label:$('fPublisher').value.trim(),enrich:true};
  try{const{data,error}=await sb.functions.invoke('lookup-media',{body:{search,providers:providerSettings}});if(error)throw error;const m=data?.merged||data?.best||data?.candidates?.[0];if(!m){showToast('追加情報は見つかりませんでした');return}let count=0;count+=fillIfEmpty('fScoreTitle',m.title)?1:0;count+=fillIfEmpty('fScoreComposer',m.composer||m.artist)?1:0;count+=fillIfEmpty('fLyricist',m.lyricist)?1:0;count+=fillIfEmpty('fPublisher',m.publisher||m.label)?1:0;count+=fillIfEmpty('fIsbn',m.isbn)?1:0;count+=fillIfEmpty('fIsmn',m.ismn)?1:0;count+=fillIfEmpty('fScoreFormat',m.scoreFormat)?1:0;count+=fillIfEmpty('fDescription',m.description||'')?1:0;
    const inferredLang=uniqTags([
      ...(m.languageTags||[]),
      ...inferLanguageTagsFromText([
        m.description,m.notes,
        m.rawSource?JSON.stringify(m.rawSource):'',
        ...(data?.candidates||[]).map(c=>JSON.stringify(c))
      ].join(' '))
    ]);
    if(inferredLang.length){
      mergeSelectedTags('fLanguageTags',inferredLang);
      renderTagPicker('language');
      count++;
    }if(!$('fScoreContents').value.trim()&&Array.isArray(m.contents)&&m.contents.length){$('fScoreContents').value=scoreContentsToText(m.contents);updateScoreContentCount();count++}if(!$('fCoverUrl').value&&m.coverUrl){$('fCoverUrl').value=m.coverUrl;updateCoverPreview(m.coverUrl,m.source||'外部データベース',m.sourceUrl||'');count++}if(Array.isArray(data?.sources))$('fRawSource').value=JSON.stringify({enrichmentSources:data.sources,candidates:data.candidates||[]});await autoFillScorePersonKana();
    showToast(count?`${count}項目を補完しました`:'既存情報を優先したため変更はありません');}catch(err){console.error(err);showToast('メタデータ補完に失敗しました')}finally{btn.disabled=false;btn.textContent='外部DBから空欄を補完'}
}


async function loadLibrary(){
  const{data,error}=await sb.from('library_items').select('*').order('created_at',{ascending:false});
  if(error){alert('ライブラリを取得できませんでした。');return}
  library=data||[];
  const scoreIds=library.filter(x=>x.material_type==='score'||x.media_type==='楽譜').map(x=>x.id).filter(Boolean);
  let contents=[];
  if(scoreIds.length){
    const res=await sb.from('score_contents').select('*').in('library_item_id',scoreIds).order('track_no',{ascending:true});
    if(!res.error)contents=res.data||[];
  }
  const byItem={};contents.forEach(c=>(byItem[c.library_item_id]??=[]).push(c));
  library.forEach(x=>x.score_contents=byItem[x.id]||[]);
  updateStats();renderLibrary()
}function qty(a){return a.reduce((s,x)=>s+(Number(x.quantity)||1),0)}function updateStats(){$('countAll').textContent=qty(library);$('countCD').textContent=qty(library.filter(x=>x.material_type!=='score'&&['CD','CD-R'].includes(x.media_type)));$('countVideo').textContent=qty(library.filter(x=>x.material_type!=='score'&&['DVD','DVD-R','Blu-ray'].includes(x.media_type)));$('countScore').textContent=qty(library.filter(x=>x.material_type==='score'||x.media_type==='楽譜'));$('countReview').textContent=library.filter(x=>x.needs_review).length}
function renderLibrary(){
  const q=$('searchInput').value.trim().toLowerCase(),g=$('genreFilter').value,r=$('reviewFilter').value,m=$('materialFilter').value,list=$('libraryList');
  list.innerHTML='';
  const items=library.filter(x=>{
    const hay=[x.search_text,x.title,x.title_kana,x.artist,x.artist_kana,x.composer,x.composer_kana,x.lyricist,x.lyricist_kana,x.arranger,x.conductor,x.performers,x.ensemble,x.label,x.publisher,x.catalog_no,x.barcode,x.isbn,x.ismn,x.edition,x.series,x.score_format,...(x.voicing_tags||[]),...(x.instrumentation_tags||[]),...(x.language_tags||[]),x.description,x.location,x.operator_name,...(x.playlist||[]),...(x.tags||[]),...(x.score_contents||[]).flatMap(c=>[c.title,c.title_original,c.composer,c.lyricist,c.arranger,c.voicing,c.accompaniment,c.language,c.notes])].filter(Boolean).join(' ').toLowerCase();
    const mt=x.material_type||((x.media_type==='楽譜')?'score':'media');
    return(!q||hay.includes(q))&&(!g||x.genre===g)&&(!m||mt===m)&&(!r||String(x.needs_review)===r)
  });
  if(!items.length){list.innerHTML='<p class="muted">該当する資料はありません。</p>';return}
  items.forEach(item=>{
    const n=$('itemTemplate').content.cloneNode(true);
    const article=n.querySelector('.library-item');
    const isScore=item.material_type==='score'||item.media_type==='楽譜';
    if(isScore)article.classList.add('score-item');
    n.querySelector('.media-pill').textContent=isScore?'楽譜':(item.media_type||'CD');
    n.querySelector('.genre-pill').textContent=item.genre||'ジャンル未設定';
    n.querySelector('.review-pill').classList.toggle('hidden',!item.needs_review);
    n.querySelector('.item-title').textContent=item.title;
    n.querySelector('.item-artist').textContent=isScore?[item.composer,item.lyricist?`作詞：${item.lyricist}`:''].filter(Boolean).join(' / '):(item.artist||'');
    n.querySelector('.item-meta').textContent=isScore
      ? [item.publisher,item.voicing,item.score_format,item.isbn?`ISBN ${item.isbn}`:'',item.ismn?`ISMN ${item.ismn}`:'',item.catalog_no].filter(Boolean).join(' / ')
      : [item.composer,item.conductor,item.ensemble,item.release_year,item.catalog_no].filter(Boolean).join(' / ');
    const cq=$('searchInput').value.trim().toLowerCase();
    const hitSongs=(item.score_contents||[]).filter(c=>cq&&[c.title,c.title_original,c.composer,c.lyricist,c.arranger].filter(Boolean).join(' ').toLowerCase().includes(cq)).slice(0,3);
    n.querySelector('.item-location').textContent=[
      item.location?`収納：${item.location}`:'',
      item.quantity>1?`所蔵数：${item.quantity}`:'',
      hitSongs.length?`収録：${hitSongs.map(c=>c.title).join('、')}`:''
    ].filter(Boolean).join(' / ');
    n.querySelector('.item-operator').textContent=`入力者：${item.operator_name||'-'}`;
    const cover=n.querySelector('.item-cover');if(item.cover_url){cover.src=item.cover_url;cover.classList.remove('hidden')}
    else if(isScore){cover.classList.remove('hidden');cover.alt='楽譜';cover.removeAttribute('src')}
    n.querySelector('.edit-item').addEventListener('click',()=>openEditor(item));list.appendChild(n)
  })
}


function openMetadataSearch(){
  $('metadataSearchModal').classList.remove('hidden');
  $('metadataSearchStatus').textContent='';
  setTimeout(()=>$('msCatalogNo').focus(),50);
}
function closeMetadataSearch(){$('metadataSearchModal').classList.add('hidden')}

async function searchMetadata(e){
  e.preventDefault();
  const search={
    materialType:$('msMaterialType').value,
    catalogNo:$('msCatalogNo').value.trim(),
    isbn:$('msIsbn').value.trim(),
    ismn:$('msIsmn').value.trim(),
    title:$('msTitle').value.trim(),
    artist:$('msArtist').value.trim(),
    label:$('msLabel').value.trim(),
    year:$('msYear').value.trim()
  };
  if(!search.catalogNo&&!search.isbn&&!search.ismn&&!search.title&&!search.artist&&!search.label){
    $('metadataSearchStatus').textContent='規格品番・ISBN・ISMN・タイトル・作曲者・出版社など、いずれかを入力してください。';return;
  }
  $('metadataSearchResults').innerHTML='';
  $('metadataSearchStatus').textContent='外部データベースを横断検索しています…';
  try{
    const {data,error}=await sb.functions.invoke('lookup-media',{body:{search,providers:providerSettings}});
    if(error)throw error;
    $('metadataSearchStatus').textContent=data?.found
      ? `${data.candidates.length}件の候補が見つかりました。盤面・ケースの品番や発売年を確認して選択してください。`
      : `候補が見つかりませんでした。${formatAttempts(data?.attempts||[])}`;
    renderMetadataCandidates(data?.candidates||[]);
    if(data?.attempts?.length)showSource(formatAttempts(data.attempts));
  }catch(err){console.error(err);$('metadataSearchStatus').textContent='外部データベース検索に失敗しました。検索条件を変えて再度お試しください。';}
}

function renderMetadataCandidates(items){
  const list=$('metadataSearchResults');list.innerHTML='';
  if(!items.length){list.innerHTML='<div class="candidate-empty">候補はありません。条件を少し減らすか、表記を変えて検索してください。</div>';return;}
  items.forEach((item,index)=>{
    const card=document.createElement('article');card.className='candidate-card';
    let cover;
    if(item.coverUrl){cover=document.createElement('img');cover.className='candidate-cover';cover.src=item.coverUrl;cover.alt='';}
    else{cover=document.createElement('div');cover.className='candidate-cover placeholder';cover.textContent='💿';}
    const body=document.createElement('div');
    const title=document.createElement('h3');title.className='candidate-title';title.textContent=item.title||'タイトル不明';
    if(item.matchScore){const badge=document.createElement('span');badge.className='candidate-score';badge.textContent=`一致度 ${Math.round(item.matchScore)}`;title.appendChild(badge)}
    const sub=document.createElement('p');sub.className='candidate-sub';sub.textContent=item.artist||'';
    const meta=document.createElement('p');meta.className='candidate-meta';meta.textContent=[item.label,item.catalogNo,item.year,item.mediaType].filter(Boolean).join(' / ');
    const src=document.createElement('p');src.className='candidate-source';src.textContent=`取得元：${item.source||'-'}`;
    body.append(title,sub,meta,src);
    const btn=document.createElement('button');btn.className='primary candidate-select';btn.type='button';btn.textContent='この盤を選ぶ';btn.addEventListener('click',()=>selectMetadataCandidate(item));
    card.append(cover,body,btn);list.appendChild(card);
  });
}

function selectMetadataCandidate(item){
  closeMetadataSearch();
  openEditor(mapServerCandidate(item,''));
  $('lookupMessage').textContent=`${item.source||'外部データベース'}の候補を登録画面に反映しました。内容を確認してください。`;
  showSource(`取得元：${item.source||'-'} / バーコードなし検索`);
}

async function lookupBarcode(raw){
  const barcode=raw.replace(/\D/g,'');
  if(!barcode){
    $('lookupMessage').textContent='バーコードを入力してください。';
    return;
  }

  $('barcodeInput').value=barcode;
  $('sourceMessage').classList.add('hidden');
  $('explorerStatus').classList.remove('hidden');
  $('explorerText').textContent='棚の奥まで探索しています…';

  const existing=library.filter(x=>x.barcode===barcode);
  if(existing.length){
    $('lookupMessage').textContent=
      `同じバーコードがすでに${existing.length}件あります。外部情報も確認します。`;
  }else{
    $('lookupMessage').textContent='外部データベースを検索しています…';
  }

  try{
    const {data,error}=await sb.functions.invoke('lookup-media',{
      body:{barcode,materialType:$('registrationMaterialType').value,providers:providerSettings}
    });

    if(error)throw error;

    $('explorerStatus').classList.add('hidden');

    if(!data?.found || !data.best){
      openEditor({barcode,material_type:$('registrationMaterialType').value,media_type:$('registrationMaterialType').value==='score'?'楽譜':'CD',isbn:$('registrationMaterialType').value==='score'&&/^97[89]/.test(barcode)?barcode:'',needs_review:true});
      $('lookupMessage').textContent=
        '外部データベースに一致する資料が見つかりませんでした。手動登録画面を開きました。';
      showSource(formatAttempts(data?.attempts||[]));
      return;
    }

    const best=data.best;
    openEditor(mapServerCandidate(best,barcode));

    const otherCount=Math.max(0,(data.candidates?.length||1)-1);
    $('lookupMessage').textContent=otherCount
      ? `候補を取得しました。ほかにも${otherCount}件の候補があります。内容を確認して保存してください。`
      : '候補を取得しました。内容を確認して保存してください。';

    showSource(
      `取得元：${best.source} / ${formatAttempts(data.attempts||[])}`
    );
  }catch(error){
    console.error('lookup-media error',error);
    $('explorerStatus').classList.add('hidden');
    openEditor({barcode,material_type:$('registrationMaterialType').value,media_type:$('registrationMaterialType').value==='score'?'楽譜':'CD',isbn:$('registrationMaterialType').value==='score'&&/^97[89]/.test(barcode)?barcode:'',needs_review:true});
    $('lookupMessage').textContent=
      '検索サーバーに接続できませんでした。手動登録画面を開きました。';
    showSource('検索サービス：接続エラー');
  }
}

function formatAttempts(attempts){
  if(!attempts?.length)return '検索履歴なし';
  return attempts.map(x=>{
    const s=x.status==='found'?'取得'
      :x.status==='not_found'?'該当なし'
      :x.status==='disabled'?'未設定'
      :x.status==='skipped'?'OFF'
      :'接続失敗';
    const detail=(x.status==='error'&&x.detail)
      ? `（${String(x.detail).replace(/^Error:\s*/,'').slice(0,90)}）`
      : '';
    return `${x.name}：${s}${detail}`;
  }).join(' / ');
}

function showSource(text){
  $('sourceMessage').textContent=text;
  $('sourceMessage').classList.remove('hidden');
}

function mapServerCandidate(r,barcode){
  return{
    barcode,
    material_type:r.materialType||((r.mediaType==='楽譜')?'score':'media'),
    media_type:r.mediaType||'CD',
    title:r.title||'',
    title_kana:r.titleKana||'',
    artist_kana:r.artistKana||'',
    release_date_text:r.releaseDateText||'',
    album_type:r.albumType||'',
    playlist:Array.isArray(r.playlist)?r.playlist:[],
    books_genre_id:r.booksGenreId||'',
    raw_source:r.rawSource||null,
    artist:r.artist||'',
    isbn:r.isbn||'',ismn:r.ismn||'',lyricist:r.lyricist||'',arranger:r.arranger||'',publisher:r.publisher||'',edition:r.edition||'',series:r.series||'',score_format:r.scoreFormat||'',voicing:r.voicing||'',accompaniment:r.accompaniment||'',language:r.language||'',page_count:r.pageCount||'',voicing_tags:Array.isArray(r.voicingTags)?r.voicingTags:[],instrumentation_tags:Array.isArray(r.instrumentationTags)?r.instrumentationTags:[],language_tags:uniqTags([...(Array.isArray(r.languageTags)?r.languageTags:[]),...inferLanguageTagsFromText([r.description,r.notes,r.rawSource?JSON.stringify(r.rawSource):''].join(' '))]),description:r.description||'',score_contents:Array.isArray(r.contents)?r.contents:[],
    release_year:r.year||'',
    label:r.label||'',
    catalog_no:r.catalogNo||'',
    disc_count:r.discCount||1,
    genre:r.genre||'',
    cover_url:r.coverUrl||'',
    source_name:r.source||'',
    source_url:r.sourceUrl||'',
    notes:r.notes||'',
    needs_review:true
  };
}
function guessMediaType(r){const f=(r.media||[]).map(m=>(m.format||'').toLowerCase()).join(' ');if(f.includes('blu-ray'))return'Blu-ray';if(f.includes('dvd'))return'DVD';return'CD'}
function openEditor(i){
  $('editorCard').classList.remove('hidden');
  const material=i.material_type||((i.media_type==='楽譜')?'score':'media');
  $('itemId').value=i.id||'';setEditorMaterialType(material);
  $('fCoverUrl').value=i.cover_url||'';$('fSourceName').value=i.source_name||'';$('fSourceUrl').value=i.source_url||'';$('fBooksGenreId').value=i.books_genre_id||'';$('fRawSource').value=i.raw_source?JSON.stringify(i.raw_source):'';updateCoverPreview(i.cover_url||'',i.source_name||'',i.source_url||'');
  if(material==='score'){
    $('fScoreTitle').value=i.title||'';$('fScoreComposer').value=i.composer||i.artist||'';$('fComposerKana').value=i.composer_kana||i.artist_kana||'';$('fLyricist').value=i.lyricist||'';$('fLyricistKana').value=i.lyricist_kana||'';$('fPublisher').value=i.publisher||i.label||'';$('fIsbn').value=i.isbn||((/^97[89]/.test(i.barcode||''))?i.barcode:'');$('fIsmn').value=i.ismn||'';$('fScoreFormat').value=i.score_format||'';saveSelectedTags('fVoicingTags',i.voicing_tags||[]);saveSelectedTags('fInstrumentationTags',i.instrumentation_tags||[]);saveSelectedTags('fLanguageTags',uniqTags([...(i.language_tags||[]),...inferLanguageTagsFromText([i.description,i.notes,i.raw_source?JSON.stringify(i.raw_source):''].join(' '))]));$('fScoreContents').value=scoreContentsToText(i.score_contents||[]);$('fDescription').value=i.description||'';$('fScoreNotes').value=i.id?(i.notes||''):'';updateScoreContentCount();renderAllScoreTagPickers();
  }else{
    $('fBarcode').value=i.barcode||'';$('fMediaType').value=i.media_type||'CD';$('fTitle').value=i.title||'';$('fArtist').value=i.artist||'';$('fTitleKana').value=i.title_kana||'';$('fArtistKana').value=i.artist_kana||'';$('fYear').value=i.release_year||'';$('fReleaseDateText').value=i.release_date_text||'';$('fLabel').value=i.label||'';$('fCatalogNo').value=i.catalog_no||'';$('fDiscCount').value=i.disc_count||1;$('fAlbumType').value=i.album_type||'';$('fComposer').value=i.composer||'';$('fConductor').value=i.conductor||'';$('fPerformers').value=i.performers||'';$('fEnsemble').value=i.ensemble||'';$('fGenre').value=i.genre||'';$('fLocation').value=i.location||'';$('fQuantity').value=i.quantity||1;$('fOperator').value=operatorName;$('fPlaylist').value=(i.playlist||[]).join('\n');$('fTags').value=(i.tags||[]).join('; ');$('fNotes').value=i.notes||'';
  }
  $('fNeedsReview').checked=!!i.needs_review;$('editorTitle').textContent=i.id?'登録内容を編集':'登録内容を確認';$('deleteItemBtn').classList.toggle('hidden',!i.id);const dup=i.barcode&&library.some(x=>x.barcode===i.barcode&&x.id!==i.id);$('duplicateBadge').classList.toggle('hidden',!dup);$('editorCard').scrollIntoView({behavior:'smooth',block:'start'});
}
$('itemForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const p=formPayload(),id=$('itemId').value||null;let error,itemId=id;
  if(id){
    p.updated_at=new Date().toISOString();
    ({error}=await sb.from('library_items').update(p).eq('id',id));
  }else{
    const res=await sb.from('library_items').insert(p).select('id').single();
    error=res.error;itemId=res.data?.id||null;
  }
  if(error){alert('保存できませんでした。');return}
  try{
    if(p.material_type==='score'){
      await saveScoreContents(itemId);
      await upsertPersonMaster(p.composer,p.composer_kana,'composer');
      await upsertPersonMaster(p.lyricist,p.lyricist_kana,'lyricist');
    }
  }catch(err){console.error(err);alert('資料は保存しましたが、収録曲の保存に失敗しました。');}
  $('editorCard').classList.add('hidden');$('barcodeInput').value='';$('lookupMessage').textContent='保存しました。';await loadLibrary()
});

async function deleteCurrentItem(){
  const id=$('itemId').value;
  if(!id)return;

  const item=library.find(x=>x.id===id);
  const title=item?.title||'この資料';

  const ok=confirm(`「${title}」を削除します。\n\nこの操作は取り消せません。削除してよろしいですか？`);
  if(!ok)return;

  const ok2=confirm('本当に削除しますか？\n登録データは元に戻せません。');
  if(!ok2)return;

  const btn=$('deleteItemBtn');
  btn.disabled=true;
  btn.textContent='削除しています…';

  try{
    const {error}=await sb.from('library_items').delete().eq('id',id);
    if(error)throw error;

    $('editorCard').classList.add('hidden');
    $('lookupMessage').textContent='削除しました。';
    showToast('資料を削除しました');
    await loadPeopleMaster();await loadLibrary();
  }catch(err){
    console.error(err);
    alert('削除できませんでした。Supabaseの削除権限を確認してください。');
  }finally{
    btn.disabled=false;
    btn.textContent='この資料を削除';
  }
}

function formPayload(){
  const score=$('fMaterialType').value==='score';
  if(score){
    const isbn=$('fIsbn').value.replace(/[\s-]/g,'')||null;
    return{barcode:isbn,material_type:'score',media_type:'楽譜',title:$('fScoreTitle').value.trim(),title_kana:null,artist:$('fScoreComposer').value.trim()||null,artist_kana:$('fComposerKana').value.trim()||null,composer:$('fScoreComposer').value.trim()||null,composer_kana:$('fComposerKana').value.trim()||null,lyricist:$('fLyricist').value.trim()||null,lyricist_kana:$('fLyricistKana').value.trim()||null,publisher:$('fPublisher').value.trim()||null,label:null,isbn,ismn:$('fIsmn').value.trim()||null,score_format:$('fScoreFormat').value||null,voicing_tags:selectedTagsFromHidden('fVoicingTags'),instrumentation_tags:selectedTagsFromHidden('fInstrumentationTags'),language_tags:selectedTagsFromHidden('fLanguageTags'),description:$('fDescription').value.trim()||null,notes:$('fScoreNotes').value.trim()||null,playlist:parseScoreContents($('fScoreContents').value).map(x=>x.title),genre:null,location:null,quantity:1,tags:[],needs_review:$('fNeedsReview').checked,cover_url:$('fCoverUrl').value||null,source_name:$('fSourceName').value||null,source_url:$('fSourceUrl').value||null,books_genre_id:$('fBooksGenreId').value||null,raw_source:(()=>{try{return $('fRawSource').value?JSON.parse($('fRawSource').value):null}catch{return null}})(),operator_name:operatorName};
  }
  return{barcode:$('fBarcode').value.trim()||null,material_type:'media',media_type:$('fMediaType').value,title:$('fTitle').value.trim(),title_kana:$('fTitleKana').value.trim()||null,artist:$('fArtist').value.trim()||null,artist_kana:$('fArtistKana').value.trim()||null,release_year:Number($('fYear').value)||null,release_date_text:$('fReleaseDateText').value.trim()||null,label:$('fLabel').value.trim()||null,catalog_no:$('fCatalogNo').value.trim()||null,disc_count:Number($('fDiscCount').value)||1,album_type:$('fAlbumType').value.trim()||null,composer:$('fComposer').value.trim()||null,conductor:$('fConductor').value.trim()||null,performers:$('fPerformers').value.trim()||null,ensemble:$('fEnsemble').value.trim()||null,genre:$('fGenre').value||null,location:$('fLocation').value.trim()||null,quantity:Number($('fQuantity').value)||1,playlist:$('fPlaylist').value.split(/\n+/).map(x=>x.trim()).filter(Boolean),tags:$('fTags').value.split(';').map(x=>x.trim()).filter(Boolean),notes:$('fNotes').value.trim()||null,needs_review:$('fNeedsReview').checked,cover_url:$('fCoverUrl').value||null,source_name:$('fSourceName').value||null,source_url:$('fSourceUrl').value||null,books_genre_id:$('fBooksGenreId').value||null,raw_source:(()=>{try{return $('fRawSource').value?JSON.parse($('fRawSource').value):null}catch{return null}})(),operator_name:operatorName};
}

function updateCoverPreview(url,sourceName,sourceUrl){
  const wrap=$('coverPreviewWrap');
  const img=$('coverPreview');
  if(!url){
    wrap.classList.add('hidden');
    img.removeAttribute('src');
    return;
  }
  img.src=url;
  $('coverSourceTitle').textContent=sourceName?`取得元：${sourceName}`:'ジャケット画像';
  $('coverSourceText').textContent=sourceUrl?'外部データベースの情報を使用しています。':'';
  wrap.classList.remove('hidden');
}


function resultInsideScannerTarget(result){
  try{
    const pts=result?.getResultPoints?.()||[];
    if(!pts.length)return true; // Some formats/readers do not expose points.
    const video=$('scannerVideo');
    const vw=video.videoWidth||video.clientWidth;
    const vh=video.videoHeight||video.clientHeight;
    if(!vw||!vh)return false;

    const xs=pts.map(p=>typeof p.getX==="function"?p.getX():p.x).filter(Number.isFinite);
    const ys=pts.map(p=>typeof p.getY==="function"?p.getY():p.y).filter(Number.isFinite);
    if(!xs.length||!ys.length)return false;

    const cx=(Math.min(...xs)+Math.max(...xs))/2;
    const cy=(Math.min(...ys)+Math.max(...ys))/2;

    // Must match the visible guide: x 12–88%, y 38–62%.
    return cx>=vw*.12 && cx<=vw*.88 && cy>=vh*.38 && cy<=vh*.62;
  }catch{
    return false;
  }
}
async function startScanner(){$('scannerPanel').classList.remove('hidden');$('lookupMessage').textContent='カメラを起動しています…';try{scanner=new ZXing.BrowserMultiFormatReader();const constraints={audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}};await scanner.decodeFromConstraints(constraints,'scannerVideo',async result=>{if(result&&resultInsideScannerTarget(result)){const code=result.getText();stopScanner();$('barcodeInput').value=code;$('lookupMessage').textContent=`バーコードを読み取りました：${code}`;await lookupBarcode(code)}});$('lookupMessage').textContent='バーコードを画面内に入れてください。'}catch(error){console.error(error);$('lookupMessage').textContent='カメラを起動できませんでした。Safariのカメラ権限を確認してください。'}}function stopScanner(){try{scanner?.reset()}catch{}scanner=null;$('scannerPanel').classList.add('hidden')}
$('checkUpdateBtn').addEventListener('click',async()=>{closeSettings();await checkForUpdate(true)});$('updateNowBtn').addEventListener('click',forceAppUpdate);async function checkForUpdate(show){try{const r=await fetch(`${VERSION_URL}?t=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(r.status);const info=await r.json(),latest=info.version;if(compareVersions(latest,APP_VERSION)>0){$('updateBannerTitle').textContent=`新しいバージョン v${latest} があります`;$('updateBannerText').textContent=info.summary||'最新版に更新できます。';$('updateBanner').classList.remove('hidden');if(show)showToast(`v${latest} に更新できます`)}else{$('updateBanner').classList.add('hidden');if(show)showToast('現在のバージョンは最新です')}}catch(e){if(show)showToast('更新情報を確認できませんでした')}}function compareVersions(a,b){const pa=String(a).split('.').map(Number),pb=String(b).split('.').map(Number),l=Math.max(pa.length,pb.length);for(let i=0;i<l;i++){const av=pa[i]||0,bv=pb[i]||0;if(av>bv)return 1;if(av<bv)return-1}return 0}async function forceAppUpdate(){showToast('最新版を読み込んでいます…');try{if('serviceWorker'in navigator){for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister()}if('caches'in window){for(const k of await caches.keys())await caches.delete(k)}}catch{}const u=new URL(location.href);u.searchParams.set('update',Date.now());location.replace(u.toString())}
$('showHistoryBtn').addEventListener('click',async()=>{closeSettings();await showUpdateHistory()});$('closeHistoryBtn').addEventListener('click',()=>$('historyModal').classList.add('hidden'));async function showUpdateHistory(){const c=$('historyList');c.innerHTML='<p class="muted">読み込んでいます…</p>';$('historyModal').classList.remove('hidden');try{const r=await fetch(`${HISTORY_URL}?t=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(r.status);const data=await r.json();c.innerHTML='';data.forEach(e=>{const s=document.createElement('section');s.className='history-entry';const h=document.createElement('h3');h.textContent=`v${e.version} — ${e.date}`;s.appendChild(h);if(e.summary){const p=document.createElement('p');p.textContent=e.summary;s.appendChild(p)}if(e.changes?.length){const ul=document.createElement('ul');e.changes.forEach(x=>{const li=document.createElement('li');li.textContent=x;ul.appendChild(li)});s.appendChild(ul)}c.appendChild(s)})}catch{c.innerHTML='<p class="muted">アップデート履歴を読み込めませんでした。</p>'}}function showToast(m){const t=$('toast');t.textContent=m;t.classList.remove('hidden');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>t.classList.add('hidden'),2500)}
$('diagnoseSearchBtn').addEventListener('click',async()=>{
  closeSettings();
  showToast('検索サービスを確認しています…');
  try{
    const {data,error}=await sb.functions.invoke('lookup-media',{body:{diagnostic:true}});
    if(error)throw error;
    const lines=(data.providers||[]).map(x=>`${x.available?'✓':'－'} ${x.name}`).join('\n');
    alert(`検索サービス診断\n\n${lines}\n\n✓：利用可能\n－：追加設定で利用可能`);
  }catch(e){
    console.error(e);
    alert('検索サービスに接続できませんでした。\nSupabase Edge Function「lookup-media」の設定を確認してください。');
  }
});


$('providerSettingsBtn').addEventListener('click',async()=>{closeSettings();await openProviderSettings()});
$('closeProviderModalBtn').addEventListener('click',()=>{$('providerModal').classList.add('hidden')});
$('enableRecommendedBtn').addEventListener('click',()=>{providerSettings={rakuten:true,musicbrainz:true,discogs:true,cdstub:true,upcitemdb:false};saveProviderSettings();renderProviderSettings()});
$('enableAllAvailableBtn').addEventListener('click',()=>{Object.keys(PROVIDER_DEFAULTS).forEach(k=>providerSettings[k]=providerAvailability[k]!==false);saveProviderSettings();renderProviderSettings()});
async function getProviderStatus(){const {data,error}=await sb.functions.invoke('lookup-media',{body:{diagnostic:true}});if(error)throw error;providerAvailability={};(data.providers||[]).forEach(x=>providerAvailability[x.key]=!!x.available);return data.providers||[]}
async function openProviderSettings(){$('providerModal').classList.remove('hidden');$('providerList').innerHTML='<p class="muted">検索サービスを確認しています…</p>';try{renderProviderSettings(await getProviderStatus())}catch(e){console.error(e);$('providerList').innerHTML='<p class="muted">検索サービスの状態を取得できませんでした。もう一度お試しください。</p>'}}
function renderProviderSettings(providers){providers=providers||[{key:'rakuten',name:'楽天ブックス CD/DVD',available:providerAvailability.rakuten!==false},{key:'musicbrainz',name:'MusicBrainz',available:providerAvailability.musicbrainz!==false},{key:'discogs',name:'Discogs',available:providerAvailability.discogs!==false},{key:'cdstub',name:'MusicBrainz CDStub',available:providerAvailability.cdstub!==false},{key:'upcitemdb',name:'UPCitemdb',available:providerAvailability.upcitemdb!==false}];const list=$('providerList');list.innerHTML='';providers.forEach(p=>{const row=document.createElement('label');row.className=`provider-row ${p.available?'':'unavailable'}`;const main=document.createElement('div');main.className='provider-main';const title=document.createElement('strong');title.textContent=p.name;const sub=document.createElement('small');sub.textContent=p.available?'利用可能':'追加設定が必要です';main.append(title,sub);const toggle=document.createElement('input');toggle.type='checkbox';toggle.className='provider-switch';toggle.checked=!!providerSettings[p.key]&&!!p.available;toggle.disabled=!p.available;toggle.addEventListener('change',()=>{providerSettings[p.key]=toggle.checked;saveProviderSettings()});row.append(main,toggle);list.appendChild(row)})}
