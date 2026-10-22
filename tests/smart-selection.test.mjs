import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseObjectMask } from '../app/utils/smart-selection-mask.ts'
import { SmartSelectionClient } from '../app/utils/smart-selection.ts'

test('selects the best-scoring object that contains the clicked point', () => {
  const candidates = new Uint8Array([1,0,0,0, 0,1,1,0, 1,1,0,0])
  assert.deepEqual(chooseObjectMask(candidates, [0.99,0.9,0.7], 2, 2, 1, 0), new Uint8Array([0,1,1,0]))
})

const input = () => ({ rgba: new ArrayBuffer(16), width: 2, height: 2, x: 0, y: 0 })
function fixture() {
  const workers = []
  const client = new SmartSelectionClient(() => {
    const worker = { terminate() { this.terminated = true }, postMessage(message, transfer) { this.message = message; this.transfer = transfer } }
    workers.push(worker); return worker
  })
  return { client, workers }
}
test('selection transfers pixels, reports progress, validates masks and reuses the worker', async () => {
  const { client, workers } = fixture(), progress = [], request = input()
  const first = client.select(request, message => progress.push(message)), worker = workers[0]
  assert.deepEqual(worker.transfer, [request.rgba])
  worker.onmessage({ data: { type: 'progress', message: 'Finding your object…' } })
  worker.onmessage({ data: { type: 'result', mask: new Uint8Array([1,0,0,0]).buffer } })
  assert.deepEqual(await first, new Uint8Array([1,0,0,0]))
  assert.deepEqual(progress, ['Finding your object…'])
  const second = client.select(input(), () => {})
  assert.equal(workers.length, 1)
  worker.onmessage({ data: { type: 'result', mask: new ArrayBuffer(1) } })
  await assert.rejects(second, /Could not select/)
  assert.ok(worker.terminated)
})
test('cancel terminates loading; stale events cannot settle the next selection', async () => {
  const { client, workers } = fixture()
  const first = client.select(input(), () => {}), oldEvent = workers[0].onmessage
  client.cancel()
  await assert.rejects(first, /cancelled/)
  const second = client.select(input(), () => {})
  oldEvent({ data: { type: 'error', message: 'Stale error' } })
  workers[1].onmessage({ data: { type: 'result', mask: new Uint8Array([0,1,0,0]).buffer } })
  assert.deepEqual(await second, new Uint8Array([0,1,0,0]))
  client.cancel()
})
test('rejects missing objects, malformed masks, non-finite scores and full-image selection', () => {
  assert.throws(() => chooseObjectMask(new Uint8Array([0,0,0,0]), [1], 2, 2, 0, 0), /No object/)
  assert.throws(() => chooseObjectMask(new Uint8Array([1,1,1,1]), [1], 2, 2, 0, 0), /isolate/)
  assert.throws(() => chooseObjectMask(new Uint8Array([1]), [1], 2, 2, 0, 0), /brush/)
  assert.throws(() => chooseObjectMask(new Uint8Array([1,0,0,0]), [NaN], 2, 2, 0, 0), /No object/)
  assert.throws(() => chooseObjectMask(new Uint8Array([1,0,0,0]), [1], 2, 2, -1, 0), /inside/)
})
