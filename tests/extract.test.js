import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePostId,isVideoUrl,normalize} from '../lib/extract.js';

test('accepts only X/Twitter public post URLs and ids',()=>{
 assert.equal(parsePostId('https://x.com/test/status/1234567890123456789?s=20'),'1234567890123456789');
 assert.equal(parsePostId('https://twitter.com/test/status/20'),'20');
 assert.equal(parsePostId('20'),'20');
 assert.equal(parsePostId('https://evil.com/test/status/20'),null);
 assert.equal(parsePostId('https://x.com.evil.com/test/status/20'),null);
 assert.equal(parsePostId('javascript:alert(1)'),null);
});
test('video proxy strict host and type validation',()=>{
 assert.equal(isVideoUrl('https://video.twimg.com/ext_tw_video/123/pu/vid/1280x720/a.mp4?tag=12'),true);
 assert.equal(isVideoUrl('https://video.twimg.com.evil.com/a.mp4'),false);
 assert.equal(isVideoUrl('http://video.twimg.com/a.mp4'),false);
 assert.equal(isVideoUrl('https://video.twimg.com/a.m3u8'),false);
});
test('normalizes syndication variants',()=>{
 const output=normalize({user_screen_name:'creator',mediaDetails:[{media_url_https:'https://pbs.twimg.com/1.jpg',video:{durationMs:2300,variants:[{content_type:'application/x-mpegURL',url:'https://video.twimg.com/a.m3u8'},{content_type:'video/mp4',bitrate:832000,url:'https://video.twimg.com/ext_tw_video/123/pu/vid/640x360/x.mp4'}]}}]},'20');
 assert.equal(output.media.length,1);assert.equal(output.media[0].variants.length,1);assert.equal(output.media[0].variants[0].height,360);
});
test('normalizes Fx API videos',()=>{
 const output=normalize({status:{author:{screen_name:'fox'},text:'hello',media:{videos:[{type:'video',url:'https://video.twimg.com/abc.mp4',duration:10,thumbnail_url:'https://pbs.twimg.com/x.jpg'}]}}},'22');
 assert.equal(output.author,'fox');assert.equal(output.media[0].durationMs,10000);
});
