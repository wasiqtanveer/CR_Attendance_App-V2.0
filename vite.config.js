import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

function offlineAssets() {
  let outputDirectory
  let projectRoot
  return {
    name: 'offline-assets',
    apply: 'build',
    configResolved(config) { projectRoot = config.root; outputDirectory = join(config.root, config.build.outDir) },
    async closeBundle() {
      const files = (await readdir(join(outputDirectory, 'assets'))).map(name => `/assets/${name}`).sort()
      const worker = await readFile(join(projectRoot, 'public', 'sw.js'), 'utf8')
      const fingerprint = createHash('sha256').update(files.join('|')).update(worker)
      for (const file of ['icon-192.png', 'icon-512.png', 'manifest.json']) {
        fingerprint.update(await readFile(join(projectRoot, 'public', file)))
      }
      const version = fingerprint.digest('hex').slice(0, 12)
      await writeFile(join(outputDirectory, 'precache.json'), JSON.stringify(['/index.html', '/icon-192.png', '/icon-512.png', '/manifest.json', ...files]))
      await writeFile(join(outputDirectory, 'sw.js'), worker.replace('__BUILD_HASH__', version))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), offlineAssets()],
})
