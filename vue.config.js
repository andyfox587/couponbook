// vue.config.js
import { defineConfig } from '@vue/cli-service'

export default defineConfig({
  transpileDependencies: true,
  devServer: {
    proxy: {
      '/api': {
        target: 'http://[::1]:3000',
        changeOrigin: true,
        // if your Express routes are exactly under /api,
        // you can keep the path as-is:
        pathRewrite: { '^/api': '/api' },
        // or strip the prefix if your Express app mounts at "/":
        // pathRewrite: { '^/api': '' },
      },
    },
  },
})
