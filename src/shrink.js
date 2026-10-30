import './shrink.css';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { Zip, ZipPassThrough } from 'fflate';
import { isVideoFile, fmt, percentSaved, outputName, uniqueNames, ffmpegArgs } from './shrink-utils.js';

const $ = selector => document.querySelector(selector);
const el = {
  drop:$('#drop'),pickFiles:$('#pickFiles'),pickDir:$('#pickDir'),fileInput:$('#fileInput'),dirInput:$('#dirInput'),
  qSeg:$('#qSeg'),rSeg:$('#rSeg'),aSeg:$('#aSeg'),est:$('#est'),
  queueCard:$('#queueCard'),list:$('#list'),cnt:$('#cnt'),clearBtn:$('#clearBtn'),
  dock:$('#dock'),sumTxt:$('#sumTxt'),sumCut:$('#sumCut'),
  startBtn:$('#startBtn'),saveAllBtn:$('#saveAllBtn'),stopBtn:$('#stopBtn'),toast:$('#toast')
};
const options={crf:23,max:1080,ab:'128k'};
const ios=/iP(hone|ad|od)/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
const INPUT_LIMIT=ios?60*1048576:150*1048576;
const ZIP_LIMIT=ios?190*1048576:600*1048576;
let items=[],seq=0,running=false,stopRequested=false,toastTimer=null,preparedZip=null;
let ff=null,loading=null;
const active=it=>it.status==='done'||it.status==='kept';
const completed=()=>items.filter(active);

function toast(message,delay=3800){
  el.toast.textContent=message;el.toast.classList.add('on');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.toast.classList.remove('on'),delay);
}
function clearZip(){
  preparedZip=null;
}
function nodeFor(it){return el.list.querySelector('[data-id="'+it.id+'"]');}
function status(it,status,message,progress){
  it.status=status;
  const node=nodeFor(it);if(!node)return;
  node.classList.remove('run','done','kept','error');
  if(status!=='wait')node.classList.add(status);
  const tag=node.querySelector('.tag');
  tag.textContent=message||({wait:'待機',run:'圧縮中',done:'完了',kept:'元を維持',error:'失敗'})[status];
  if(progress!==undefined)node.querySelector('.bar i').style.width=Math.min(100,Math.max(0,progress*100)).toFixed(1)+'%';
}
function draw(){
  const finished=completed(),total=items.reduce((n,x)=>n+x.file.size,0);
  const saved=finished.reduce((n,x)=>n+Math.max(0,x.file.size-x.out.size),0);
  el.queueCard.hidden=items.length===0;el.dock.hidden=items.length===0;
  el.cnt.textContent=items.length?'('+items.length+')':'';
  el.sumTxt.textContent=finished.length+' / '+items.length+'件 · 合計 '+fmt(total);
  el.sumCut.innerHTML=finished.length?'削減 <b>'+fmt(saved)+'</b>':'';
  el.startBtn.disabled=running||!items.some(x=>x.status==='wait');
  el.startBtn.textContent=running?'圧縮処理中…':items.some(x=>x.status==='wait')?'圧縮を開始':'処理完了';
  el.saveAllBtn.hidden=finished.length===0;
  el.saveAllBtn.disabled=running;
  el.saveAllBtn.textContent=finished.length===1?'動画を保存':preparedZip?'ZIPを保存（タップ）':'すべて保存（ZIP · '+finished.length+'件）';
  el.stopBtn.hidden=!running;el.stopBtn.textContent=stopRequested?'中止を受付済み':'以降の処理を中止';
  el.clearBtn.disabled=running||!items.some(x=>x.status==='done'||x.status==='kept'||x.status==='error');
  [...el.list.children].forEach(row=>{
    const it=items.find(x=>String(x.id)===row.dataset.id);
    if(it)row.querySelector('.rm').disabled=running;
  });
  for(const seg of [el.qSeg,el.rSeg,el.aSeg])for(const b of seg.children)b.disabled=running;
  el.est.textContent='CRF '+options.crf+' ・ 最大 '+(options.max?options.max+'p':'元の解像度')+' ・ 音声 '+options.ab+'（削減率は素材によって変わります）';
}
function renderItem(it){
  const row=document.createElement('div');row.className='item';row.dataset.id=String(it.id);
  row.innerHTML='<img class="th" alt="動画のプレビュー" src="/shrink-icon.svg"><div class="info"><div class="nm"></div><div class="sz"></div><div class="bar"><i></i></div></div><div class="end"><span class="tag">待機</span><button class="download-one" type="button" hidden>保存</button><button class="rm" type="button" aria-label="このファイルを削除">×</button></div>';
  row.querySelector('.nm').textContent=it.file.name;
  row.querySelector('.sz').textContent=fmt(it.file.size);
  row.querySelector('.rm').onclick=()=>{
    if(running)return toast('処理中のファイルは削除できません');
    clearZip();items=items.filter(x=>x.id!==it.id);row.remove();draw();
  };
  row.querySelector('.download-one').onclick=()=>saveSingle(it);
  el.list.append(row);
}
async function generateThumb(it){
  // Optional and deliberately sequential-ish. Never retain video object URLs.
  if(it.file.size>90*1048576)return;
  const url=URL.createObjectURL(it.file);
  const video=document.createElement('video');video.muted=true;video.preload='metadata';video.playsInline=true;
  const timerStart=()=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{cleanup();reject(Error('preview timeout'))},4000);
    const cleanup=()=>{clearTimeout(timer);video.removeEventListener('loadeddata',ok);video.removeEventListener('error',bad)};
    const ok=()=>{cleanup();resolve()},bad=()=>{cleanup();reject(Error('preview'))};
    video.addEventListener('loadeddata',ok);video.addEventListener('error',bad);
  });
  try{
    const ready=timerStart();video.src=url;video.load();await ready;
    const canvas=document.createElement('canvas');canvas.width=144;canvas.height=88;
    const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.drawImage(video,0,0,144,88);
    const target=nodeFor(it)?.querySelector('img.th');
    if(target)target.src=canvas.toDataURL('image/jpeg',.56);
  }catch{}finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url)}
}
function addFiles(fileList){
  if(running)return toast('圧縮中はファイルを追加できません');
  const incoming=[...fileList].filter(isVideoFile);
  if(!incoming.length)return toast('動画ファイルが見つかりません');
  const keys=new Set(items.map(x=>x.file.name+'|'+x.file.size+'|'+x.file.lastModified+'|'+(x.file.webkitRelativePath||'')));
  let added=0;
  for(const file of incoming){
    const key=file.name+'|'+file.size+'|'+file.lastModified+'|'+(file.webkitRelativePath||'');
    if(keys.has(key))continue;
    keys.add(key);
    const it={id:++seq,file,status:'wait',out:null,kept:false,error:null};
    items.push(it);renderItem(it);added++;
    if(added<=8)generateThumb(it); // other rows retain safe static icon
  }
  if(added)clearZip();draw();
  if(!added)toast('同じファイルは既に追加されています');
}
async function loadEngine(){
  if(ff)return ff;
  if(loading)return loading;
  loading=(async()=>{
    const engine=new FFmpeg();
    // ESM core is recommended by ffmpeg.wasm for Vite projects.
    const base='https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
    await engine.load({
      coreURL:await toBlobURL(base+'/ffmpeg-core.js','text/javascript'),
      wasmURL:await toBlobURL(base+'/ffmpeg-core.wasm','application/wasm')
    });
    ff=engine;return ff;
  })();
  try{return await loading}catch(e){loading=null;throw new Error('圧縮エンジンを読み込めません。ネット接続をご確認ください')}
}
async function transcode(it,onProgress){
  const engine=await loadEngine();
  const ext=(it.file.name.match(/\.([a-zA-Z0-9]{2,6})$/)||[])[1]||'mp4';
  const inName='input_'+it.id+'.'+ext.toLowerCase();
  const outName='out_'+it.id+'.mp4';
  let wrote=false;
  const listener=({progress})=>{if(Number.isFinite(progress))onProgress(Math.max(0,Math.min(1,progress)))};
  engine.on('progress',listener);
  try{
    await engine.writeFile(inName,new Uint8Array(await it.file.arrayBuffer()));wrote=true;
    const code=await engine.exec(ffmpegArgs(inName,outName,options),300000);
    if(code!==0)throw new Error('変換に失敗。形式・コーデックをご確認ください');
    const bytes=await engine.readFile(outName);
    if(bytes.length<1000)throw Error('出力が空でした');
    return new Blob([bytes],{type:'video/mp4'});
  }finally{
    engine.off('progress',listener);
    if(wrote)try{await engine.deleteFile(inName)}catch{}
    try{await engine.deleteFile(outName)}catch{}
  }
}
function markFinished(it,out,kept){
  it.out=out;it.kept=kept;
  status(it,kept?'kept':'done',kept?'元を維持':'完了',1);
  const row=nodeFor(it);if(!row)return;
  const label=kept?fmt(it.file.size)+'（元の動画）':fmt(it.file.size)+' → '+fmt(out.size)+'（-'+percentSaved(out.size,it.file.size)+'%）';
  row.querySelector('.sz').textContent=label;
  row.querySelector('.download-one').hidden=false;
}
async function runQueue(){
  if(running)return;
  const todo=items.filter(x=>x.status==='wait');if(!todo.length)return;
  running=true;stopRequested=false;clearZip();draw();
  try{
    for(const it of todo){
      if(stopRequested)break;
      status(it,'run','準備中',.02);
      const node=nodeFor(it);
      try{
        if(it.file.size>INPUT_LIMIT){
          markFinished(it,it.file,true);
          toast('大きなファイルはメモリ保護のため圧縮せず保持します');
        }else{
          const out=await transcode(it,p=>{
            const bar=node?.querySelector('.bar i');if(bar)bar.style.width=(Math.max(0,Math.min(1,p))*100).toFixed(1)+'%';
            const tag=node?.querySelector('.tag');if(tag)tag.textContent='処理 '+Math.round(Math.max(0,Math.min(1,p))*100)+'%';
          });
          markFinished(it,out.size<it.file.size?out:it.file,out.size>=it.file.size);
        }
      }catch(e){
        it.error=e.message||'形式に対応していません';
        status(it,'error','失敗',0);
        if(node)node.querySelector('.sz').textContent=it.error;
      }
      draw();
      await new Promise(resolve=>setTimeout(resolve,0));
    }
  }finally{running=false;draw();toast(stopRequested?'キューを中断しました':'処理が終了しました')}
}
function anchorSave(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),120000);
}
function shareOrDownload(blob,name,mime){
  const file=new File([blob],name,{type:mime});
  if(navigator.canShare?.({files:[file]})){
    try{
      // Called directly from click — don't await asynchronous preparation before share().
      const promise=navigator.share({files:[file],title:name});
      promise.catch(e=>{if(e.name!=='AbortError'){anchorSave(blob,name);toast('共有が使えないためダウンロードに切り替えました')}});
      return;
    }catch{}
  }
  anchorSave(blob,name);
  toast('ファイルに保存してください。iPhoneでは「ファイル」アプリのダウンロードも確認できます');
}
function saveSingle(it){
  if(running||!it.out)return;
  shareOrDownload(it.out,outputName(it.file.name,it.kept),'video/'+(it.kept&&it.file.type?it.file.type.split('/')[1]:'mp4'));
}
async function makeZip(done){
  return new Promise((resolve,reject)=>{
    const chunks=[];
    const archive=new Zip((error,data,final)=>{
      if(error){reject(error);return}
      if(data?.length)chunks.push(data);
      if(final)resolve(new Blob(chunks,{type:'application/zip'}));
    });
    (async()=>{
      const names=uniqueNames(done.map(it=>outputName(it.file.name,it.kept)));
      for(let i=0;i<done.length;i++){
        const entry=new ZipPassThrough(names[i]);archive.add(entry);
        const reader=done[i].out.stream().getReader();
        try{
          for(;;){
            const {done:atEnd,value}=await reader.read();
            if(atEnd)break;
            entry.push(value,false);
          }
          entry.push(new Uint8Array(0),true);
        }finally{reader.releaseLock()}
      }
      archive.end();
    })().catch(reject);
  });
}
async function saveAll(){
  if(running)return;
  const done=completed();if(!done.length)return;
  if(done.length===1)return saveSingle(done[0]);
  const bytes=done.reduce((n,it)=>n+it.out.size,0);
  if(bytes>ZIP_LIMIT)return toast('ZIPが大きすぎます。各動画の「保存」から個別に保存してください',5500);
  if(preparedZip){
    shareOrDownload(preparedZip.blob,preparedZip.name,'application/zip');
    return;
  }
  el.saveAllBtn.disabled=true;el.saveAllBtn.textContent='ZIPを準備中…';
  try{
    const blob=await makeZip(done);
    const name='shrink-'+new Date().toISOString().slice(0,10)+'.zip';
    preparedZip={blob,name};
    el.saveAllBtn.textContent='ZIPを保存（タップ）';
    toast('ZIPが完成しました。もう一度「ZIPを保存」をタップしてください',5500);
  }catch(e){toast('ZIPの作成に失敗しました。個別保存をご利用ください',5500)}
  finally{el.saveAllBtn.disabled=false;draw()}
}

el.pickFiles.onclick=()=>el.fileInput.click();
el.pickDir.onclick=()=>{
  if(!('webkitdirectory' in el.dirInput))return toast('このブラウザではフォルダ選択に対応していません');
  el.dirInput.click();
};
el.drop.onclick=()=>el.fileInput.click();
el.drop.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.fileInput.click()}};
el.fileInput.onchange=e=>{addFiles(e.target.files);e.target.value=''};
el.dirInput.onchange=e=>{addFiles(e.target.files);e.target.value=''};
for(const event of ['dragenter','dragover'])el.drop.addEventListener(event,e=>{e.preventDefault();el.drop.classList.add('over')});
for(const event of ['dragleave','drop'])el.drop.addEventListener(event,e=>{e.preventDefault();el.drop.classList.remove('over')});
el.drop.addEventListener('drop',e=>addFiles(e.dataTransfer.files));
function bind(segment,key,parse){
  segment.addEventListener('click',e=>{
    const button=e.target.closest('button');if(!button||running)return;
    const value=button.dataset[key==='crf'?'crf':key==='max'?'max':'ab'];
    options[key]=parse(value);
    [...segment.children].forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    draw();
  });
}
bind(el.qSeg,'crf',Number);bind(el.rSeg,'max',Number);bind(el.aSeg,'ab',String);
el.startBtn.onclick=runQueue;
el.stopBtn.onclick=()=>{stopRequested=true;draw()};
el.saveAllBtn.onclick=saveAll;
el.clearBtn.onclick=()=>{
  if(running)return;
  items=items.filter(it=>{
    if(it.status==='wait'||it.status==='run')return true;
    nodeFor(it)?.remove();return false;
  });
  clearZip();draw();
};
draw();
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
