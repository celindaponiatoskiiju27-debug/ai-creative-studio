import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue2'
import { resolve } from 'node:path'
export default defineConfig({
  plugins:[vue()],
  build:{rollupOptions:{input:{main:resolve(process.cwd(),'index.html'),admin:resolve(process.cwd(),'admin.html')}}},
  server:{host:'0.0.0.0',port:5174,proxy:{'/api':'http://localhost:3001'}}
})
