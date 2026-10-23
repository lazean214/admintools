/** Extensions supplement image/* because camera RAW files often have no MIME type. */
export const RAW_PHOTO_EXTENSIONS = ['3fr', 'arw', 'cr2', 'cr3', 'crw', 'dcr', 'dng', 'erf', 'iiq', 'kdc', 'mef', 'mos', 'mrw', 'nef', 'nrw', 'orf', 'pef', 'raf', 'raw', 'rw2', 'rwl', 'sr2', 'srf', 'srw', 'x3f']
export const PHOTO_ACCEPT = ['image/*', ...['heic', 'heif', 'hif', 'avif', 'tif', 'tiff', 'psd', 'psb', 'jxl', 'jp2', 'j2k', 'jpf', 'jpx', 'tga', 'dds', 'exr', 'hdr', 'pnm', 'ppm', 'pgm', 'pbm', 'qoi', ...RAW_PHOTO_EXTENSIONS].map((extension) => '.' + extension)].join(',')

export function isRawPhoto(name: string) {
  return RAW_PHOTO_EXTENSIONS.includes(name.split('.').pop()?.toLowerCase() || '')
}
