import {build} from 'vite';
import {writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'.memoire-server');
if(dirname(output)!==root)throw new Error('Server output must stay within the project.');

// Vercel traces JavaScript handlers after the application build. Bundle the
// existing Kernel once so that traced functions never depend on source .ts paths.
// Keep browser configuration inert; server credentials are read only at runtime.
await build({root,configFile:false,envDir:false,define:{'import.meta.env':'{}'},build:{
  ssr:resolve(root,'api/_commercial.js'),target:'node22',outDir:output,emptyOutDir:true,
  rolldownOptions:{output:{entryFileNames:'commercial.mjs'}},
}});
await writeFile(resolve(output,'commercial.d.mts'),"export { createCommercialHandler } from '../api/_commercial.js';\n");
