import { build } from 'esbuild';

await build({
  entryPoints: ['frontend/glass.jsx'],
  outfile: 'dist/assets/zakiglass.js',
  bundle: true,
  jsx: 'automatic',
  minify: true,
  legalComments: 'linked',
  target: ['es2022', 'safari16'],
  define: { 'process.env.NODE_ENV': '"production"' }
});
