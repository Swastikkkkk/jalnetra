import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
export default defineConfig({ plugins: [react(), tailwindcss(), viteSingleFile({ useRecommendedBuildConfig: false })], build: { assetsInlineLimit: 8192, cssCodeSplit: false, chunkSizeWarningLimit: 10000, rollupOptions: { output: { inlineDynamicImports: true } } } })
