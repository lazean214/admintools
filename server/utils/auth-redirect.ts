/** OAuth return locations must stay on this origin, including URL-parser rules
 * that treat a backslash as a slash in an HTTP URL. */
export function normalizeAuthRedirect(value:unknown):string {
  const fallback='/profile-settings'
  if(typeof value!=='string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value) || /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(value))return fallback
  try {
    const url=new URL(value,'https://internal.invalid')
    if(url.origin!=='https://internal.invalid')return fallback
    return url.pathname+url.search+url.hash
  } catch {return fallback}
}
