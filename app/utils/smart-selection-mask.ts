/** Choose the highest-scoring candidate that actually includes the requested point. */
export function chooseObjectMask(data: ArrayLike<number | bigint>, scores: ArrayLike<number | bigint>, width: number, height: number, x: number, y: number) {
  const size = width * height
  if (!Number.isSafeInteger(size) || size < 1 || size > 1024 * 1024 || data.length !== size * scores.length || !scores.length) throw new Error('Could not select this object. Try the brush instead.')
  if (![x, y].every(Number.isFinite) || x < 0 || y < 0 || x >= width || y >= height) throw new Error('Click inside the image.')
  const point = Math.floor(y) * width + Math.floor(x)
  let best = -1, bestScore = -Infinity
  for (let i = 0; i < scores.length; i++) {
    const score = Number(scores[i])
    if (Number(data[i * size + point]) > 0 && Number.isFinite(score) && score > bestScore) { best = i; bestScore = score }
  }
  if (best < 0) throw new Error('No object found at that point. Try another point or use the brush.')
  const mask = new Uint8Array(size)
  let count = 0
  for (let i = 0; i < size; i++) { mask[i] = Number(data[best * size + i]) > 0 ? 1 : 0; count += mask[i]! }
  if (!count || count === size) throw new Error('Could not isolate this object. Try another point or use the brush.')
  return mask
}

