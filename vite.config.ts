import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
    plugins: [react()],
    base: './', // CRITICAL: Ensures assets load correctly in Zendesk iframe
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    build: {
        outDir: 'assets', // <--- CHANGED from 'dist' to 'assets'
        emptyOutDir: true,
        assetsDir: 'static', // Puts JS/CSS in assets/static to avoid confusion
        sourcemap: false,
    }
})