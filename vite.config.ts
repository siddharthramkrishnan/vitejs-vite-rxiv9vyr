import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/sheets': {
        target:
          'https://docs.google.com/spreadsheets/d/e/2PACX-1vT31UzKCW8l2Gu-1LZX0hqzKYC8wNlExucMcmXS07RZtX7Q8j6uNA-K0vMBT3HfilFoGC_KLt3yK226/pub',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sheets/, ''),
      },
    },
  },
});
