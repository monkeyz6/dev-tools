import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import ts from 'typescript'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const files = [
  'src/tools/model-probe/protocol.ts',
  'src/tools/model-probe/oracles.ts',
  'src/tools/model-probe/origin.ts',
  'src/tools/model-probe/profiles.ts',
  'src/tools/model-probe/batch.ts',
  'src/tools/model-probe/batch.test.ts',
  'src/tools/ModelProbeExport.ts',
  'src/tools/ModelProbeExport.test.ts',
  'src/tools/model-probe/builtin-tools.ts',
  'src/tools/model-probe/builtin-tools.test.ts',
  'src/tools/model-probe/protocol.test.ts',
  'src/tools/model-probe/profiles.test.ts',
  'src/tools/model-probe/request-id.ts',
  'src/tools/model-probe/request-id.test.ts',
  'src/tools/model-probe/negative.ts',
  'src/tools/model-probe/negative.test.ts',
  'src/tools/model-probe/cell.ts',
  'src/tools/model-probe/cell.test.ts',
  'src/tools/model-probe/matrix-present.ts',
  'src/tools/model-probe/matrix-present.test.ts',
  'src/tools/video-report/types.ts',
  'src/tools/video-report/errors.ts',
  'src/tools/video-report/errors.test.ts',
  'src/tools/video-report/retry.ts',
  'src/tools/video-report/retry.test.ts',
  'src/tools/video-report/official-url.ts',
  'src/tools/video-report/official-url.test.ts',
  'src/tools/video-report/seedance-url.ts',
  'src/tools/video-report/seedance-url.test.ts',
  'src/tools/video-report/summary.ts',
  'src/tools/video-report/google-omni.ts',
  'src/tools/video-report/google-omni.test.ts',
  'src/shared/video-meta.ts',
  'src/shared/video-meta.test.ts',
]
const outDir = join(root, '.tmp-unit')
rmSync(outDir, { recursive: true, force: true })

for (const rel of files) {
  const src = readFileSync(join(root, rel), 'utf8')
  let { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: rel,
  })
  outputText = outputText.replace(/from ['"]\.\/([^'"]+?)(?:\.ts)?['"]/g, "from './$1.js'")
  const dest = join(outDir, rel.replace(/\.ts$/, '.js'))
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, outputText)
}

const r = spawnSync(
  process.execPath,
  [
    '--test',
    join(outDir, 'src/tools/model-probe/batch.test.js'),
    join(outDir, 'src/tools/ModelProbeExport.test.js'),
    join(outDir, 'src/tools/model-probe/builtin-tools.test.js'),
    join(outDir, 'src/tools/model-probe/protocol.test.js'),
    join(outDir, 'src/tools/model-probe/profiles.test.js'),
    join(outDir, 'src/tools/model-probe/request-id.test.js'),
    join(outDir, 'src/tools/model-probe/negative.test.js'),
    join(outDir, 'src/tools/model-probe/cell.test.js'),
    join(outDir, 'src/tools/model-probe/matrix-present.test.js'),
    join(outDir, 'src/tools/video-report/errors.test.js'),
    join(outDir, 'src/tools/video-report/retry.test.js'),
    join(outDir, 'src/tools/video-report/official-url.test.js'),
    join(outDir, 'src/tools/video-report/seedance-url.test.js'),
    join(outDir, 'src/tools/video-report/google-omni.test.js'),
    join(outDir, 'src/shared/video-meta.test.js'),
  ],
  { stdio: 'inherit' },
)
process.exit(r.status ?? 1)
