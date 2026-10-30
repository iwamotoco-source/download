import { Readable, Transform } from 'node:stream';
import { isVideoUrl } from '../lib/extract.js';

const LIMIT=120*1024*1024;
function reject(res,status,message){return res.status(status).json({error:message})}
async function allowedFetch(input){
  let link=input;
  for(let i=0;i<3;i++){
    if(!isVideoUrl(link))throw new Error('不正な動画URL');
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),18000);
    let resp;
    try{resp=await fetch(link,{redirect:'manual',headers:{'Accept':'video/mp4,*/*'},signal:controller.signal});}
    finally{clearTimeout(timer)}
    if([301,302,303,307,308].includes(resp.status)){
      link=new URL(resp.headers.get('location')||'',link).href;
      await resp.body?.cancel();
      continue;
    }
    return resp;
  }
  throw new Error('リダイレクトが多すぎます');
}
export default async function handler(req,res){
  if(req.method!=='GET')return reject(res,405,'GETのみ対応');
  const u=String(req.query.url||'');
  if(!isVideoUrl(u))return reject(res,400,'無効な動画URL');
  try{
    const up=await allowedFetch(u);
    if(!up.ok||!up.body)return reject(res,502,'元動画を取得できませんでした');
    const type=(up.headers.get('content-type')||'').toLowerCase();
    if(type && !(/video\/|octet-stream/.test(type)))return reject(res,502,'動画以外のデータが返されました');
    const size=Number(up.headers.get('content-length')||0);
    if(size>LIMIT)return reject(res,413,'120MBを超える動画はこのサーバーでは取得できません');
    res.statusCode=200;
    res.setHeader('Content-Type','video/mp4');
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if(size)res.setHeader('Content-Length',String(size));
    let loaded=0;
    const limit=new Transform({transform(chunk,_,cb){loaded+=chunk.length;cb(loaded>LIMIT?new Error('120MB制限'):null,chunk)}});
    Readable.fromWeb(up.body).on('error',()=>res.destroy()).pipe(limit).on('error',()=>res.destroy()).pipe(res);
  }catch(e){if(!res.headersSent)reject(res,502,'動画配信元に接続できませんでした');else res.destroy()}
}