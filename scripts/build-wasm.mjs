import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, delimiter } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const localCargo = resolve(root, '.cache/cargo/bin')
const env = { ...process.env }
if (existsSync(localCargo)) {
  env.CARGO_HOME ??= resolve(root, '.cache/cargo')
  env.RUSTUP_HOME ??= resolve(root, '.cache/rustup')
  env.PATH = `${localCargo}${delimiter}${env.PATH}`
}
const executable = process.platform === 'win32' ? '.exe' : ''
const cargo = existsSync(resolve(localCargo, `cargo${executable}`)) ? resolve(localCargo, `cargo${executable}`) : 'cargo'
const localBindgen = resolve(root, '.cache/tools/wasm-bindgen-0.2.114-x86_64-pc-windows-msvc', 'wasm-bindgen.exe')
const bindgen = existsSync(localBindgen) ? localBindgen : 'wasm-bindgen'

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' })
  if (result.error) { console.error(result.error.message); process.exit(1) }
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const toolchain = process.env.RUSTUP_TOOLCHAIN ? [] : process.platform === 'win32' && existsSync(resolve(root, '.cache/rustup/toolchains/stable-x86_64-pc-windows-gnu'))
  ? ['+stable-x86_64-pc-windows-gnu'] : []
for (const ejari of process.argv.includes('--ejari') ? [true] : [false, true]) {
  const crate = ejari ? 'ejari-pdf-wasm' : 'processing-wasm'
  const name = ejari ? 'admintools_ejari' : 'admintools_processing'
  const directory = ejari ? 'ejari' : 'processing'
  run(cargo, [...toolchain, 'build', '--manifest-path', `crates/${crate}/Cargo.toml`, '--target', 'wasm32-unknown-unknown', '--release', '--locked'])
  run(bindgen, [`crates/${crate}/target/wasm32-unknown-unknown/release/${name}.wasm`, '--target', 'web', '--out-dir', `app/wasm/${directory}`, '--out-name', name])
}
