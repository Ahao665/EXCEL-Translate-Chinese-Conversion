import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  // 部署到 GitHub Pages: https://aha0665.github.io/EXCEL-Translate-Chinese-Conversion/
  // 仓库名必须和这里的路径保持一致
  base: '/EXCEL-Translate-Chinese-Conversion/',
})
