use miniz_oxide::deflate::compress_to_vec_zlib;

// Deliberately limited PDF 1.4 encoder: one raster RGB page, lossless Flate
// compression, classic xref table. It does not parse templates or encode fonts.
pub fn create(rgba: &[u8], width: u32, height: u32, page_width: f64, page_height: f64) -> Result<Vec<u8>, String> {
    let pixels = u64::from(width) * u64::from(height);
    if width == 0 || height == 0 || width > 16_384 || height > 16_384 || pixels > crate::MAX_PIXELS as u64 || rgba.len() as u64 != pixels * 4 {
        return Err("Invalid PDF raster dimensions or pixel buffer length.".into());
    }
    if !page_width.is_finite() || !page_height.is_finite() || !(1.0..=14_400.0).contains(&page_width) || !(1.0..=14_400.0).contains(&page_height) {
        return Err("PDF page dimensions must be between 1 and 14400 points.".into());
    }
    let mut rgb = Vec::with_capacity(pixels as usize * 3);
    for pixel in rgba.chunks_exact(4) {
        let alpha = u32::from(pixel[3]);
        for &channel in &pixel[..3] {
            rgb.push(((u32::from(channel) * alpha + 255 * (255 - alpha) + 127) / 255) as u8);
        }
    }
    let compressed = compress_to_vec_zlib(&rgb, 6);
    drop(rgb);
    let mut pdf = b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n".to_vec();
    let mut offsets = vec![0usize];
    fn object(pdf: &mut Vec<u8>, offsets: &mut Vec<usize>, body: &[u8]) {
        offsets.push(pdf.len());
        pdf.extend_from_slice(format!("{} 0 obj\n", offsets.len() - 1).as_bytes());
        pdf.extend_from_slice(body);
        pdf.extend_from_slice(b"\nendobj\n");
    }
    object(&mut pdf, &mut offsets, b"<< /Type /Catalog /Pages 2 0 R >>");
    object(&mut pdf, &mut offsets, b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    object(&mut pdf, &mut offsets, format!("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {:.6} {:.6}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>", page_width, page_height).as_bytes());
    offsets.push(pdf.len());
    pdf.extend_from_slice(format!("4 0 obj\n<< /Type /XObject /Subtype /Image /Width {} /Height {} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length {} >>\nstream\n", width, height, compressed.len()).as_bytes());
    pdf.extend_from_slice(&compressed);
    pdf.extend_from_slice(b"\nendstream\nendobj\n");
    let contents = format!("q\n{:.6} 0 0 {:.6} 0 0 cm\n/Im0 Do\nQ\n", page_width, page_height);
    object(&mut pdf, &mut offsets, format!("<< /Length {} >>\nstream\n{}endstream", contents.len(), contents).as_bytes());
    let xref = pdf.len();
    pdf.extend_from_slice(b"xref\n0 6\n0000000000 65535 f \n");
    for offset in &offsets[1..] { pdf.extend_from_slice(format!("{:010} 00000 n \n", offset).as_bytes()); }
    pdf.extend_from_slice(format!("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{}\n%%EOF\n", xref).as_bytes());
    Ok(pdf)
}
