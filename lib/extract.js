// Pure parsing helpers. Never interpret arbitrary web pages or fetch user-supplied URLs.
export function parsePostId(input){
  const s=String(input||'').trim();
  if(/^\d{2,20}$/.test(s))return s;
  try{
    const u=new URL(s); const host=u.hostname.toLowerCase();
    if(!['x.com','www.x.com','twitter.com','www.twitter.com','mobile.twitter.com'].includes(host))return null;
    const m=u.pathname.match(/^\/[A-Za-z0-9_]{1,15}\/status(?:es)?\/(\d{2,20})(?:\/.*)?$/);
    return m?.[1]||null;
  }catch{return null}
}
export function isVideoUrl(input){
  try{
    const u=new URL(input);
    return u.protocol==='https:' && !u.username && !u.password && !u.port &&
      ['video.twimg.com','video.fxtwitter.com','video-cdn.fxtwitter.com'].includes(u.hostname.toLowerCase()) &&
      u.pathname.length<600 && /\.mp4$/i.test(u.pathname);
  }catch{return false}
}
function variant(input){
  if(!input || typeof input!=='object')return null;
  const url=input.url||input.src;
  const format=String(input.content_type||input.mime_type||input.container||input.format||'').toLowerCase();
  if(format && !(/mp4/.test(format)))return null;
  if(!isVideoUrl(url))return null;
  const dim=String(url).match(/\/(\d{2,4})x(\d{2,4})\//);
  return {url,bitrate:Number(input.bitrate||input.bit_rate)||0,width:Number(input.width)||Number(dim?.[1])||0,height:Number(input.height)||Number(dim?.[2])||0,size:Number(input.size)||0};
}
function mediaObject(m){
  const arr=[...(m?.video_info?.variants||[]),...(m?.video?.variants||[]),...(m?.variants||[]),...(m?.formats||[])];
  if(m?.url && (m.type==='video'||m.type==='gif'||m.type==='animated_gif'||m.type==='ApiVideo'))arr.push(m);
  const seen=new Set(); const variants=arr.map(variant).filter(v=>v&&!seen.has(v.url)&&seen.add(v.url)).sort((a,b)=>(b.bitrate-a.bitrate)||(b.height-a.height));
  if(!variants.length)return null;
  return {thumbnail:m.thumbnail_url||m.media_url_https||m.media_url||m.poster||'',durationMs:Number(m.durationMs||m.duration_millis||m.video_info?.duration_millis||m.video?.durationMs||m.duration*1000)||0,variants:variants.slice(0,6)};
}
export function normalize(json,id){
  const post=json?.status||json?.tweet||json;
  if(!post || post.type==='tombstone')return null;
  const all=[
    ...(Array.isArray(post.media?.videos)?post.media.videos:[]),
    ...(Array.isArray(post.media?.all)?post.media.all:[]),
    ...(Array.isArray(post.extended_entities?.media)?post.extended_entities.media:[]),
    ...(Array.isArray(post.mediaDetails)?post.mediaDetails:[]),
    ...(Array.isArray(post.media_details)?post.media_details:[])
  ];
  if(!all.length && post.video)all.push(post.video);
  const seen=new Set(); const media=all.map(mediaObject).filter(m=>{
    if(!m)return false;const key=m.variants[0]?.url||'';if(!key||seen.has(key))return false;seen.add(key);return true;
  });
  const user=post.author||post.user||{};
  return {id,author:user.screen_name||post.user_screen_name||'user',text:String(post.text||post.full_text||'').slice(0,500),media:media.slice(0,4)};
}