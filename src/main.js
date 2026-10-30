import './style.css';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
const $=s=>document.querySelector(s);
const el={url:$('#url'),paste:$('#paste'),analyze:$('#analyze'),result:$('#result'),thumb:$('#thumb'),author:$('#author'),text:$('#postText'),multi:$('#multi'),videoChoices:$('#videoChoices'),qualities:$('#qualities'),sizeEst:$('#sizeEst'),compress:$('#compress'),levels:$('#levels'),seg:$('#seg'),ratio:$('#ratio'),go:$('#go'),reset:$('#reset'),prog:$('#prog'),fill:$('#fill'),progress:$('#progress'),stage:$('#stage'),toast:$('#toast')};
let state={id:null,media:[],mediaIndex:0,chosen:0,crf:28,busy:false};
let ffmpeg,ffLoad,toastTimer;
let prepared=null;
let checkingSize=0;
const MEMORY_LIMIT=70*1048576;
function clearPrepared(){prepared=null;el.go.textContent='ダウンロード';el.prog.hidden=true;}
const fmt=n=>!n?'':n>1048576?(n/1048576).toFixed(1)+' MB':Math.round(n/1024)+' KB';
const secs=ms=>{const s=Math.round((ms||0)/1000);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
const labels=['最高画質','高画質','標準','軽量'];
function toast(t,ms=3500){el.toast.textContent=t;el.toast.classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.toast.classList.remove('on'),ms)}
function stage(t,p){el.stage.textContent=t;el.fill.style.width=Math.round(Math.max(0,Math.min(1,p))*100)+'%';el.progress.setAttribute('aria-valuenow',String(Math.round(Math.max(0,Math.min(1,p))*100)))}
function selected(){return state.media[state.mediaIndex]?.variants[state.chosen]}
function estimate(v){return v?.actualBytes||v?.size||((v?.bitrate||0)/8)*((state.media[state.mediaIndex]?.durationMs||0)/1000)}
function filename(v){return 'xtract-'+state.id+'-'+(state.mediaIndex+1)+'-'+(v?.height||state.chosen+1)+'p.mp4'}
function directDownload(){
  const v=selected();
  if(!v||state.busy)return;
  const name=filename(v);
  const path='/api/media?download=1&name='+encodeURIComponent(name)+'&url='+encodeURIComponent(v.url);
  // A normal browser download streams bytes to Files / Downloads without building a Blob in JS.
  // Keep the click directly in the user's gesture so iOS Safari doesn't block the action.
  const link=document.createElement('a');
  link.href=path;link.download=name;link.rel='noopener';
  document.body.appendChild(link);link.click();link.remove();
  el.prog.hidden=false;
  stage('ダウンロードを開始しました。Safariのダウンロード一覧を確認してください',1);
  toast('大容量モードで保存を開始しました。「ファイル」アプリのダウンロードを確認してください',6000);
}
function refreshMode(){
  if(prepared)return;
  const v=selected();if(!v)return;
  const bytes=estimate(v);
  if(bytes>MEMORY_LIMIT){
    el.go.textContent='大容量モードで保存';
    el.sizeEst.textContent=(state.media[state.mediaIndex]?.durationMs?secs(state.media[state.mediaIndex].durationMs)+' · ':'')+'約'+fmt(bytes);
  }else{
    el.go.textContent='ダウンロード';
  }
}
async function probeSize(v,mediaIndex){
  const serial=++checkingSize;
  try{
    const r=await fetch('/api/media?probe=1&url='+encodeURIComponent(v.url),{cache:'no-store'});
    if(!r.ok)return;
    const result=await r.json();
    if(Number.isFinite(result.bytes)&&result.bytes>0){
      v.actualBytes=result.bytes;
      if(state.mediaIndex===mediaIndex&&selected()===v&&checkingSize===serial)refreshMode();
    }
  }catch{}
}
function updateRatio(){el.ratio.textContent=el.compress.checked?'動画により変動':'オフ'}
function chooseVideo(i){
  clearPrepared();checkingSize++;state.mediaIndex=i;state.chosen=0;
  const m=state.media[i];
  el.thumb.src=m.thumbnail||'/icon.svg';el.sizeEst.textContent=m.durationMs?secs(m.durationMs):'';
  el.qualities.replaceChildren();
  m.variants.forEach((v,k)=>{
    const b=document.createElement('button');b.type='button';b.className='chip';b.setAttribute('aria-pressed',String(k===0));
    const d=document.createElement('b');const est=v.size||((v.bitrate||0)/8)*(m.durationMs||0)/1000;
    b.textContent=labels[k]||'画質 '+(k+1);d.textContent=(v.height?v.height+'p · ':'')+(est?'約'+fmt(est):(v.bitrate?Math.round(v.bitrate/1000)+' kbps':'MP4'));
    b.appendChild(d);
    b.addEventListener('click',()=>{clearPrepared();state.chosen=k;[...el.qualities.children].forEach((x,n)=>x.setAttribute('aria-pressed',String(n===k)));refreshMode();probeSize(v,i)});
    el.qualities.appendChild(b);
  });
  [...el.videoChoices.children].forEach((x,n)=>x.setAttribute('aria-pressed',String(n===i)));
  refreshMode();
  probeSize(m.variants[0],i);
}
async function analyze(){
  if(state.busy)return;
  const raw=el.url.value.trim();if(!raw)return toast('ポストのURLを入力してください');
  clearPrepared();state.busy=true;el.analyze.disabled=true;el.analyze.innerHTML='<span class="spin"></span>解析中';el.result.hidden=true;
  try{
    const r=await fetch('/api/analyze?url='+encodeURIComponent(raw),{cache:'no-store'});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.error||'解析に失敗しました');
    if(!data.media?.length)throw new Error('動画が見つかりません');
    state.id=data.id;state.media=data.media;state.mediaIndex=0;state.chosen=0;
    el.author.textContent='@'+data.author;el.text.textContent=data.text||'';
    el.multi.hidden=data.media.length<2;el.videoChoices.replaceChildren();
    data.media.forEach((m,i)=>{
      const b=document.createElement('button');b.type='button';b.className='chip';b.textContent='動画 '+(i+1);b.setAttribute('aria-pressed',String(i===0));b.onclick=()=>chooseVideo(i);el.videoChoices.appendChild(b);
    });
    chooseVideo(0);el.result.hidden=false;el.prog.hidden=true;el.result.scrollIntoView({behavior:'smooth',block:'nearest'});
  }catch(e){toast(e.message||'解析に失敗しました',5000)}
  finally{state.busy=false;el.analyze.disabled=false;el.analyze.textContent='動画を解析'}
}
async function fetchBlob(url,callback){
  const candidates=[url,'/api/media?url='+encodeURIComponent(url)];let last;
  for(const target of candidates){
    try{
      const r=await fetch(target,{cache:'no-store',credentials:'omit'});
      if(!r.ok){const body=await r.json().catch(()=>({}));throw new Error(body.error||'HTTP '+r.status)}
      const len=Number(r.headers.get('content-length'))||0;
      if(len>MEMORY_LIMIT){const error=new Error('このサイズは「大容量・直接保存」を利用してください');error.code='LARGE_VIDEO';throw error;}
      if(!r.body){const b=await r.blob();callback(1);return b}
      const reader=r.body.getReader();const chunks=[];let got=0;
      for(;;){const {done,value}=await reader.read();if(done)break;got+=value.byteLength;if(got>MEMORY_LIMIT){await reader.cancel();const error=new Error('端末メモリ節約のため「大容量・直接保存」を利用してください');error.code='LARGE_VIDEO';throw error;}chunks.push(value);callback(len?Math.min(got/len,.99):Math.min(.9,got/30000000))}
      const b=new Blob(chunks,{type:'video/mp4'});
      if(b.size<1024)throw new Error('動画データが空です');
      callback(1);return b;
    }catch(e){if(e.code==='LARGE_VIDEO')throw e;last=e}
  }
  throw last||new Error('動画を取得できませんでした');
}
async function encoder(){
  if(ffmpeg)return ffmpeg;
  if(ffLoad)return ffLoad;
  ffLoad=(async()=>{
    const f=new FFmpeg(),base='https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
    await f.load({coreURL:await toBlobURL(base+'/ffmpeg-core.js','text/javascript'),wasmURL:await toBlobURL(base+'/ffmpeg-core.wasm','application/wasm')});
    ffmpeg=f;return f;
  })();
  try{return await ffLoad}catch(e){ffLoad=null;throw new Error('エンコーダの読み込みに失敗しました')}
}
async function transcode(blob,crf){
  const ff=await encoder();
  const input='input-'+Date.now()+'.mp4',output='output-'+Date.now()+'.mp4';
  const onProg=({progress})=>{if(Number.isFinite(progress))stage('再エンコード中',.55+Math.max(0,Math.min(1,progress))*.4)};
  ff.on('progress',onProg);
  try{
    await ff.writeFile(input,new Uint8Array(await blob.arrayBuffer()));
    const code=await ff.exec(['-i',input,'-vf',"scale='min(1280,iw)':-2",'-c:v','libx264','-preset','ultrafast','-crf',String(crf),'-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-movflags','+faststart',output],180000);
    if(code!==0)throw new Error('再エンコードが完了しませんでした');
    const result=await ff.readFile(output);
    return new Blob([result],{type:'video/mp4'});
  }finally{ff.off('progress',onProg);for(const f of [input,output])try{await ff.deleteFile(f)}catch{}}
}
async function save(blob,name){
  const file=new File([blob],name,{type:'video/mp4'});
  if(navigator.canShare?.({files:[file]})){
    try{await navigator.share({files:[file],title:name});return true}
    catch(e){if(e.name==='AbortError')return false}
  }
  const a=document.createElement('a');const u=URL.createObjectURL(blob);a.href=u;a.download=name;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),90000);return true;
}
async function run(){
  if(prepared&&!state.busy){
    try{const ok=await save(prepared.blob,prepared.name);stage(ok?'保存先への共有が完了しました':'保存がキャンセルされました',ok?1:0)}
    catch(e){toast('共有に失敗しました。Safariで開き直して試してください',5000)}
    return;
  }
  const v=selected();if(!v||state.busy)return;
  if(estimate(v)>MEMORY_LIMIT){
    if(el.compress.checked)toast('大容量のため端末内圧縮を省略して元動画を直接保存します',4500);
    return directDownload();
  }
  state.busy=true;el.go.disabled=true;el.analyze.disabled=true;el.reset.disabled=true;el.prog.hidden=false;
  const name=filename(v);
  try{
    stage('動画を取得中',.02);
    const input=await fetchBlob(v.url,p=>stage('動画を取得中',p*.5));
    let output=input;
    if(el.compress.checked){
      if(input.size>35*1048576){toast('35MB超の動画はiPhoneのメモリ保護のため軽量化せず保存します',5000)}
      else{
        try{stage('エンコーダ準備中',.52);output=await transcode(input,state.crf);if(output.size>=input.size){output=input;toast('軽量化の効果がなかったため元動画を保存します')}}
        catch(e){console.warn(e);output=input;toast('軽量化できなかったため元動画を保存します',5000)}
      }
    }
    prepared={blob:output,name};
    stage('準備完了 — '+fmt(input.size)+' → '+fmt(output.size),1);
    el.go.textContent='保存する（タップ）';
    toast('「保存する」をタップしてiPhoneの共有シートを開いてください',5000);
  }catch(e){console.error(e);stage(e.code==='LARGE_VIDEO'?'「大容量・直接保存」をタップしてください':(e.message||'保存に失敗しました'),0);toast(e.message||'保存に失敗しました',5000)}
  finally{state.busy=false;el.go.disabled=false;el.analyze.disabled=false;el.reset.disabled=false}
}
el.paste.onclick=async()=>{try{const text=await navigator.clipboard.readText();if(!text.trim())return toast('クリップボードが空です');el.url.value=text.trim();analyze()}catch{el.url.focus();toast('長押しで貼り付けてください')}};
el.analyze.onclick=analyze;el.go.onclick=run;
const directButton=document.querySelector('#directSave');if(directButton)directButton.onclick=directDownload;
el.url.addEventListener('keydown',e=>{if(e.key==='Enter')analyze()});
el.compress.onchange=()=>{clearPrepared();el.levels.hidden=!el.compress.checked;updateRatio();refreshMode()};
el.seg.onclick=e=>{const b=e.target.closest('button');if(!b)return;clearPrepared();state.crf=Number(b.dataset.crf);refreshMode();[...el.seg.children].forEach(x=>x.setAttribute('aria-pressed',String(x===b)));updateRatio()};
el.reset.onclick=()=>{if(state.busy)return;checkingSize++;clearPrepared();el.result.hidden=true;el.prog.hidden=true;el.url.value='';el.compress.checked=false;el.levels.hidden=true;state={id:null,media:[],mediaIndex:0,chosen:0,crf:28,busy:false};[...el.seg.children].forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.crf==='28')));el.url.focus()};
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));