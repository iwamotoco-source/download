import { Readable, Transform } from 'node:stream';
import { isVideoUrl } from '../lib/extract.js';

// The limit protects infrastructure, not the platform's maximum video size.
// Data is streamed through the function and never buffered in server memory.
const LIMIT = 1024 * 1024 * 1024;
function reject(res,status,message){return res.status(status).json({error:message})}
function safeName(raw){
  const name=String(raw||'xtract-video.mp4').replace(/[^\w.\-]/g,'_').slice(0,120);
  return name.toLowerCase().endsWith('.mp4')?name:name+'.mp4';
}
async function allowedFetch(input,probe=false){
  let link=input;
  for(let i=0;i<3;i++){
    if(!isVideoUrl(link))throw new Error('不正な動画URL');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
    let resp;
    try{
      resp=await fetch(link,{redirect:'manual',headers:{
        'Accept':'video/mp4,*/*',
        ...(probe?{'Range':'bytes=0-0'}:{})
      },signal:controller.signal});
    }finally{clearTimeout(timer)}
    if([301,302,303,307,308].includes(resp.status)){
      const next=resp.headers.get('location')||'';
      if(!next){await resp.body?.cancel();throw new Error('不正なリダイレクト')}
      link=new URL(next,link).href;
      await resp.body?.cancel();
      continue;
    }
    return resp;
  }
  throw new Error('リダイレクトが多すぎます');
}
function totalFromHeaders(up,probe=false){
  const contentRange=up.headers.get('content-range')||'';
  const ranged=contentRange.match(/\/([0-9]+)$/);
  if(ranged)return Number(ranged[1]);
  const declared=Number(up.headers.get('content-length')||0);
  return !probe||up.status===200?declared:0;
}
export default async function handler(req,res){
  if(req.method!=='GET')return reject(res,405,'GETのみ対応');
  const u=String(req.query.url||'');
  if(!isVideoUrl(u))return reject(res,400,'無効な動画URL');
  const probe=String(req.query.probe||'')==='1';
  try{
    const up=await allowedFetch(u,probe);
    if(!up.ok||!up.body)return reject(res,502,'元動画を取得できませんでした');
    const type=(up.headers.get('content-type')||'').toLowerCase();
    if(type&&!(/video\/|octet-stream/.test(type))) {
      await up.body.cancel();
      return reject(res,502,'動画以外のデータが返されました');
    }
    const size=totalFromHeaders(up,probe);
    if(probe){
      await up.body.cancel();
      return res.status(200).setHeader('Cache-Control','no-store').json({
        bytes:size||null,
        direct:true,
        maxBytes:LIMIT
      });
    }
    if(size>LIMIT){
      await up.body.cancel();
      return reject(res,413,'1GBを超える動画はこの転送経路では取得できません');
    }
    res.statusCode=200;
    res.setHeader('Content-Type','video/mp4');
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if(String(req.query.download||'')==='1'){
      res.setHeader('Content-Disposition','attachment; filename="'+safeName(req.query.name)+'"');
    }
    if(size)res.setHeader('Content-Length',String(size));
    let received=0;
    const throttle=new Transform({
      transform(chunk,_,callback){
        received+=chunk.length;
        callback(received>LIMIT?new Error('1GB制限'):null,chunk);
      }
    });
    Readable.fromWeb(up.body)
      .on('error',()=>res.destroy())
      .pipe(throttle)
      .on('error',()=>res.destroy())
      .pipe(res);
  }catch(e){
    if(!res.headersSent)reject(res,502,'動画配信元に接続できませんでした');
    else res.destroy();
  }
}
