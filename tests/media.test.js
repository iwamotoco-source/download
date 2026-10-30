import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Writable } from 'node:stream';
import handler from '../api/media.js';

class MockRes extends Writable {
  constructor(){super();this.statusCode=200;this.headers={};this.parts=[];this.body=null}
  _write(chunk,encoding,cb){this.parts.push(chunk);cb()}
  setHeader(name,value){this.headers[name.toLowerCase()]=String(value);return this}
  status(code){this.statusCode=code;return this}
  json(data){this.body=data;this.end();return this}
}
const url='https://video.twimg.com/ext_tw_video/123/pu/vid/1280x720/a.mp4';
test('streaming a 200MB-declared mp4 no longer rejects at 120MB',async()=>{
  const fetchWas=globalThis.fetch;
  const bytes=200*1048576;
  globalThis.fetch=async()=>new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'video/mp4','content-length':String(bytes)}});
  try{
    const res=new MockRes(); const finish=once(res,'finish');
    await handler({method:'GET',query:{url,download:'1',name:'test.mp4'}},res);
    await finish;
    assert.equal(res.statusCode,200);
    assert.equal(res.headers['content-length'],String(bytes));
    assert.match(res.headers['content-disposition'],/attachment; filename="test.mp4"/);
    assert.equal(Buffer.concat(res.parts).length,3);
  }finally{globalThis.fetch=fetchWas}
});
test('probe returns original full size from 206 range response',async()=>{
  const fetchWas=globalThis.fetch;
  const bytes=200*1048576;
  globalThis.fetch=async (uri,options)=>{
    assert.equal(options.headers.Range,'bytes=0-0');
    return new Response(new Uint8Array([7]),{status:206,headers:{'content-type':'video/mp4','content-range':'bytes 0-0/'+bytes}});
  };
  try{
    const res=new MockRes();await handler({method:'GET',query:{url,probe:'1'}},res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.bytes,bytes);
    assert.equal(res.body.direct,true);
  }finally{globalThis.fetch=fetchWas}
});
