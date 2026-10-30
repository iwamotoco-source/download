const EXT=/\.(mp4|mov|m4v|webm|mkv|avi|mpeg|mpg)$/i;
export function isVideoFile(f){return Boolean(f && (String(f.type||'').startsWith('video/')||EXT.test(f.name||'')))}
export function fmt(n){return !n?'0 KB':n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB'}
export function percentSaved(size,orig){return orig?Math.round((1-size/orig)*100):0}
export function outputName(fileName,kept=false){
 const safe=String(fileName||'video').replace(/[/\\\x00-\x1f]/g,'_');
 if(kept)return safe;
 const stem=safe.replace(/\.[^.]+$/,'');
 return (stem||'video')+'.min.mp4';
}
export function uniqueNames(names){
 const seen=new Set();
 return names.map(name=>{
  let candidate=name,n=2;const dot=name.lastIndexOf('.'),stem=dot>=0?name.slice(0,dot):name,ext=dot>=0?name.slice(dot):'';
  while(seen.has(candidate.toLowerCase()))candidate=stem+' ('+(n++)+')'+ext;
  seen.add(candidate.toLowerCase());return candidate;
 });
}
export function ffmpegArgs(input,output,opt){
 const args=['-i',input,'-map','0:v:0','-map','0:a:0?'];
 if(opt.max) {
  const max=Number(opt.max);
  if(![720,1080].includes(max))throw Error('invalid resolution');
  args.push('-vf',"scale=w='if(gte(iw,ih),-2,trunc(min(iw,"+max+")/2)*2)':h='if(gte(iw,ih),trunc(min(ih,"+max+")/2)*2,-2)'");
 }
 args.push('-c:v','libx264','-preset','ultrafast','-crf',String(opt.crf),'-pix_fmt','yuv420p','-c:a','aac','-b:a',opt.ab,'-movflags','+faststart',output);
 return args;
}
