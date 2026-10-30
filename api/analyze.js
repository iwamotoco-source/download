import { normalize, isVideoUrl, parsePostId } from '../lib/extract.js';

const json=(res,status,body)=>res.status(status).setHeader('Cache-Control','no-store').json(body);
async function fetchJson(url){
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),11000);
  try{const r=await fetch(url,{headers:{'Accept':'application/json','User-Agent':'Xtract/1.0'},signal:controller.signal,cache:'no-store'});if(!r.ok)throw Error('upstream '+r.status);return await r.json();}
  finally{clearTimeout(timer)}
}
export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{error:'GETのみ対応しています'});
  const id=parsePostId(req.query.url||req.query.id||'');
  if(!id)return json(res,400,{error:'XのポストURLを入力してください'});
  try{
    let out;
    try{out=normalize(await fetchJson('https://api.fxtwitter.com/2/status/'+id),id);}
    catch(e){out=null;}
    if(!out?.media?.length){
      const sources=[
        'https://cdn.syndication.twimg.com/tweet-result?id='+id+'&token=a&lang=ja'
      ];
      for(const url of sources){
        try{out=normalize(await fetchJson(url),id);if(out?.media?.length)break;}catch{}
      }
    }
    if(!out?.media?.length)return json(res,404,{error:'動画が見つかりません。非公開・削除済み・動画なしの投稿には対応していません'});
    out.media=out.media.map(m=>({...m,variants:m.variants.filter(v=>isVideoUrl(v.url))})).filter(m=>m.variants.length);
    if(!out.media.length)return json(res,404,{error:'MP4形式の動画が見つかりません'});
    return json(res,200,out);
  }catch(e){return json(res,502,{error:'解析サービスに接続できませんでした。少し後に再試行してください'})}
}