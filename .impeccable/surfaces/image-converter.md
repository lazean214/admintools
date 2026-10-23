# Image Converter

Mode: Operate. Extend the existing Nuxt tool modules, navigation, Manrope body,
Space Grotesk headings, slate text and teal buttons without changing global design.

Task: choose or drop photos, choose an output format and quality, convert locally,
review per-file results, then download one result or the successful batch as ZIP.
Reference: https://github.com/Jesikurr/Universal-Image-Converter and the browser
converters at https://github.com/topics/heic-converter?l=html. Use their workflow
as inspiration, not copied source or a promise of desktop feature parity.

## Direction contract

THESIS: A dedicated format conversion workbench. Keep dimensions intact except
the explicitly described ICO constraint; link to Resize for dimension changes.

OWN-WORLD: Inherit existing module surfaces, field-control, btn-primary and
btn-secondary. Use a neutral photo list with readable names and explicit status.

STORY: Add photos, set one batch format, convert, inspect, download. Photos stay
in the browser; show limits and metadata behavior before conversion.

FIRST VIEWPORT: Module title and short guidance, wide drop target beside compact
output controls on desktop; stack on mobile. Conversion action precedes the
results list. Each row includes thumbnail, filename, dimensions, size and download.

FORM: Direct extension of the existing image-tool module shell; no concept seed
because the user specified a separate module and a concrete workflow reference.

FINISH: Verify HEIC against a real test photo, batch partial failure, cancellation,
output format signatures and dimensions, mobile/desktop layout and type checks.
