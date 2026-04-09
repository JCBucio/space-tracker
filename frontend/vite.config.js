import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Le dice a Vite que apunte a navegadores modernos que soportan "top-level await"
    target: 'esnext'
  },
  worker: {
    // Fuerza a Vite a empaquetar los workers como módulos ES nativos en lugar de 'iife'
    format: 'es'
  }
});