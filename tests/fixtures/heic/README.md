# HEIC regression photo

`example.heic` is an unchanged copy of the libheif example photo:
https://github.com/strukturag/libheif/blob/master/examples/example.heic

Retrieved 2026-10-23. SHA-256:
`7f8b363e4936c0666a25f64f3a92fda10bd8e5453be4592530b65a55dd98f3f2`

The upstream license notice and license texts are retained in `COPYING`.
This fixture is test-only and is not served with the application.
It reproduces the HEIC `ListLengthExceedsLimit` error caused by setting
ImageMagick's internal image-list resource limit to 1.
