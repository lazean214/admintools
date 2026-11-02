import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PdfImageTargetMap } from './pdf-compression'

export async function collectPdfImageTargets(
  bytes: Uint8Array,
  targetDpi: number,
  progress: (message: string) => void = () => {},
): Promise<PdfImageTargetMap> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const task = pdfjs.getDocument({ data: bytes.slice() })
  try {
    const document = await task.promise
    const targets = new Map<string, number>()
    const identity = [1, 0, 0, 1, 0, 0]
    const multiply = (left: number[], right: number[]) => [
      left[0]! * right[0]! + left[2]! * right[1]!,
      left[1]! * right[0]! + left[3]! * right[1]!,
      left[0]! * right[2]! + left[2]! * right[3]!,
      left[1]! * right[2]! + left[3]! * right[3]!,
      left[0]! * right[4]! + left[2]! * right[5]! + left[4]!,
      left[1]! * right[4]! + left[3]! * right[5]! + left[5]!,
    ]
    async function getImage(page: Awaited<ReturnType<typeof document.getPage>>, id: string) {
      const objects = id.startsWith('g_') ? page.commonObjs : page.objs
      if (objects.has(id)) return objects.get(id)
      return await new Promise<unknown>((resolve, reject) => {
        try { objects.get(id, resolve) }
        catch (error) { reject(error) }
      })
    }
    async function addTarget(page: Awaited<ReturnType<typeof document.getPage>>, id: string, placement: number[]) {
      const image = await getImage(page, id)
      if (!image || typeof image !== 'object' || !('width' in image) || !('height' in image)) return
      const width = Number(image.width), height = Number(image.height)
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) return
      const placedWidth = Math.hypot(placement[0]!, placement[1]!) * page.userUnit
      const placedHeight = Math.hypot(placement[2]!, placement[3]!) * page.userUnit
      const targetSide = Math.ceil(Math.max(placedWidth, placedHeight) * targetDpi / 72)
      const key = `${width}x${height}`
      targets.set(key, Math.max(targets.get(key) ?? 0, targetSide))
    }

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      progress(`Measuring image resolution on page ${pageNumber} of ${document.numPages}…`)
      const page = await document.getPage(pageNumber)
      const operators = await page.getOperatorList()
      let matrix = identity
      const stack: number[][] = []
      for (let index = 0; index < operators.fnArray.length; index++) {
        const operator = operators.fnArray[index]
        const args = operators.argsArray[index] as unknown[] | null
        if (operator === pdfjs.OPS.save) stack.push(matrix)
        else if (operator === pdfjs.OPS.restore) matrix = stack.pop() ?? identity
        else if (operator === pdfjs.OPS.paintFormXObjectBegin) {
          stack.push(matrix)
          if (Array.isArray(args?.[0]) && args[0].length === 6) matrix = multiply(matrix, args[0] as number[])
        }
        else if (operator === pdfjs.OPS.paintFormXObjectEnd) matrix = stack.pop() ?? identity
        else if (operator === pdfjs.OPS.transform && Array.isArray(args) && args.length === 6) {
          matrix = multiply(matrix, args as number[])
        } else if (operator === pdfjs.OPS.paintImageXObject && typeof args?.[0] === 'string') {
          await addTarget(page, args[0], matrix)
        } else if (operator === pdfjs.OPS.paintImageXObjectRepeat && typeof args?.[0] === 'string'
          && typeof args[1] === 'number' && typeof args[2] === 'number') {
          const placement = multiply(matrix, [args[1], 0, 0, args[2], 0, 0])
          await addTarget(page, args[0], placement)
        }
      }
    }
    return targets
  } finally {
    await task.destroy()
  }
}
