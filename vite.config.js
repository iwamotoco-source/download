import {defineConfig} from 'vite';
import {resolve} from 'node:path';
export default defineConfig({
 build:{rollupOptions:{input:{
 home:resolve(import.meta.dirname,'index.html'),
 xtract:resolve(import.meta.dirname,'x.html'),
 shrink:resolve(import.meta.dirname,'shrink.html')
 }}}
});
