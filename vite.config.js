import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue2'
export default defineConfig({ plugins:[vue()], server:{host:'0.0.0.0',port:5174,proxy:{'/api':'http://localhost:3001'}} })
