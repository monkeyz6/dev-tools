import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// Vite config — https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 生产构建默认不输出 sourcemap；development 模式输出 inline sourcemap 便于调试
  const emitSourcemaps = mode === 'development'

  return {
    base: '/',
    build: {
      sourcemap: emitSourcemaps ? 'inline' : false,
      minify: emitSourcemaps ? false : 'terser',
      terserOptions: emitSourcemaps
        ? undefined
        : {
            mangle: true,
            compress: true,
            format: { comments: false },
          },
      // 大依赖拆成稳定的 vendor chunk：多个工具共享时不重复打包，工具代码更新也不影响 vendor 缓存
      rolldownOptions: {
        output: {
          advancedChunks: {
            groups: [
              { name: 'vendor-recharts', test: /node_modules[\\/]recharts/ },
              { name: 'vendor-xlsx', test: /node_modules[\\/]xlsx/ },
            ],
          },
        },
      },
    },
    plugins: [
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: parseInt(process.env.PORT || '8443'),
      strictPort: true,
    },
    preview: {
      host: '0.0.0.0',
      port: parseInt(process.env.PORT || '8443'),
    },
  }
})
