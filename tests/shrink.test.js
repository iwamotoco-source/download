import test from 'node:test';
import assert from 'node:assert/strict';
import {isVideoFile,fmt,percentSaved,outputName,uniqueNames,ffmpegArgs} from '../src/shrink-utils.js';

test('recognizes video MIME and extensions',()=>{
 assert.equal(isVideoFile({name:'my.MOV',type:''}),true);
 assert.equal(isVideoFile({name:'movie.txt',type:'video/mp4'}),true);
 assert.equal(isVideoFile({name:'readme.txt',type:'text/plain'}),false);
});
test('preserves original extension if source was kept',()=>{
 assert.equal(outputName('summer.MOV',true),'summer.MOV');
 assert.equal(outputName('summer.MOV',false),'summer.min.mp4');
});
test('avoids duplicate names in ZIP',()=>{
 assert.deepEqual(uniqueNames(['a.min.mp4','a.min.mp4','a.min.mp4']),['a.min.mp4','a.min (2).mp4','a.min (3).mp4']);
});
test('reports correct byte savings',()=>{
 assert.equal(percentSaved(60,100),40);
 assert.equal(fmt(1048576),'1.0 MB');
});
test('generates 1080p orientation aware ffmpeg scale',()=>{
 const args=ffmpegArgs('input.mov','out.mp4',{max:1080,crf:23,ab:'128k'});
 const vf=args[args.indexOf('-vf')+1];
 assert.ok(vf.includes('min(ih,1080)'));
 assert.ok(vf.includes('min(iw,1080)'));
 assert.ok(args.includes('0:a:0?'));
});
test('no video filter for original resolution',()=>{
 assert.equal(ffmpegArgs('i','o',{max:0,crf:20,ab:'64k'}).includes('-vf'),false);
});
