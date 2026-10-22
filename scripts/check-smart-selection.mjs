// Optional real-model check. First run downloads the free model into ignored tmp/.
import { SamModel, AutoProcessor, RawImage, env } from '@huggingface/transformers'
import { chooseObjectMask } from '../app/utils/smart-selection-mask.ts'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'

env.cacheDir = resolve('tmp/smart-selection/cache')
env.allowLocalModels = false
const name = 'Xenova/slimsam-77-uniform'
const options = { revision: '41cefaebe8f8880948ea21fc3ef641419b6a3ab3' }
const processor = await AutoProcessor.from_pretrained(name, options)
const model = await SamModel.from_pretrained(name, { ...options, device: 'cpu', dtype: 'q8' })
try {
  const image = await (await RawImage.read(resolve('tests/fixtures/compression-photo.jpg'))).resize(768, 768)
  const x = image.width / 2, y = image.height / 2
  const inputs = await processor(image, { input_points: [[[x, y]]] })
  const outputs = await model(inputs)
  const masks = await processor.post_process_masks(outputs.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes)
  const mask = chooseObjectMask(masks[0].data, outputs.iou_scores.data, image.width, image.height, x, y)
  assert.equal(mask.length, image.width * image.height)
  assert.equal(mask[Math.floor(y) * image.width + Math.floor(x)], 1)
  const selected = mask.reduce((sum, value) => sum + value, 0)
  assert.ok(selected > 0 && selected < mask.length)
  console.log(`SlimSAM real-model check passed: ${selected} selected pixels, clicked point included.`)
} finally { await model.dispose() }
