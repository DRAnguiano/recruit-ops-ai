import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    environment: 'node',
    hookTimeout: 60_000,
    testTimeout: 60_000,
    fileParallelism: false,
  },
  plugins: [
    // SWC es necesario porque la DI de NestJS depende de emitDecoratorMetadata,
    // que esbuild (el transformador por defecto de vitest) no soporta.
    swc.vite({ module: { type: 'es6' } }),
  ],
});
