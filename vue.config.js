// vue.config.js
import { defineConfig } from '@vue/cli-service'

export default defineConfig({
  transpileDependencies: true,
  devServer: {
    proxy: {
      '/api': {
        // Defaults to the local Express server. Set API_PROXY_TARGET to point
        // the dev frontend at a deployed API instead — handy for UI-only work
        // when you don't want to run the backend + DB locally.
        target: process.env.API_PROXY_TARGET || 'http://[::1]:3000',
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
