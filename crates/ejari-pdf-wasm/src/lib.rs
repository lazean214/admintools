use sha2::{Digest, Sha256};
use wasm_bindgen::prelude::*;
use lopdf::{dictionary, Dictionary, Object, Stream};
mod editor;

const TEMPLATE_SHA256: &str = "7d73b9acc9a02eab27de682fd28fb79070c861b1214107a1ec68b52b3f1d3ddc";

fn load_template(template: &[u8]) -> Result<lopdf::Document, JsValue> {
    if template.len() > 2_000_000 {
        return Err(JsValue::from_str("EJARI template exceeds the size limit."));
    }
    if format!("{:x}", Sha256::digest(template)) != TEMPLATE_SHA256 {
        return Err(JsValue::from_str("EJARI template has changed. Review its field mapping before exporting."));
    }
    let options = lopdf::LoadOptions {
        max_decompressed_size: Some(32 * 1024 * 1024),
        ..Default::default()
    };
    let document = lopdf::Document::load_mem_with_options(template, options)
        .map_err(|e| JsValue::from_str(&format!("Could not read EJARI template: {e}")))?;
    if document.get_pages().len() != 3 {
        return Err(JsValue::from_str("EJARI template must contain three pages."));
    }
    Ok(document)
}

#[wasm_bindgen]
pub fn ejari_probe(template: &[u8]) -> Result<u32, JsValue> {
    let document = load_template(template)?;
    Ok(document.get_pages().len() as u32)
}

/// Compatibility proof only. The app continues using its established exporter
/// until field overlays and rendered equivalence have also been verified.
#[wasm_bindgen]
pub fn ejari_roundtrip(template: &[u8]) -> Result<Vec<u8>, JsValue> {
    let mut document = load_template(template)?;
    let mut output = Vec::new();
    document.save_to(&mut output)
        .map_err(|e| JsValue::from_str(&format!("Could not write EJARI template: {e}")))?;
    Ok(output)
}

/// Append bounded WinAnsi text overlays to the pinned template. Text is always
/// hex encoded, never interpreted as PDF operators. Coordinates are millimetres
/// in the existing form mapping, before its fixed 20/35 mm alignment offset.
#[wasm_bindgen]
pub fn fill_ejari(template: &[u8], text: &[u8], offsets: &[u32], placements: &[f64]) -> Result<Vec<u8>, JsValue> {
    let invalid = || JsValue::from_str("Invalid EJARI field overlay.");
    if offsets.is_empty() || offsets.len() > 65 || text.len() > 65536
        || placements.len() != (offsets.len() - 1) * 4 || offsets[0] != 0
        || offsets.last().copied() != Some(text.len() as u32) {
        return Err(invalid());
    }
    let mut overlays = [String::new(), String::new(), String::new()];
    for (index, item) in placements.chunks_exact(4).enumerate() {
        let [page, style, x, top] = [item[0], item[1], item[2], item[3]];
        if ![page, style, x, top].iter().all(|v| v.is_finite())
            || (page != 0.0 && page != 2.0) || (style != 0.0 && style != 1.0)
            || !(0.0..=180.0).contains(&x) || !(0.0..=230.0).contains(&top) {
            return Err(invalid());
        }
        let start = offsets[index] as usize;
        let end = offsets[index + 1] as usize;
        if end < start || end > text.len() || end - start > 1024 { return Err(invalid()); }
        let bytes = &text[start..end];
        if bytes.iter().any(|b| *b < 32 || *b == 127) { return Err(invalid()); }
        let encoded: String = bytes.iter().map(|b| format!("{b:02X}")).collect();
        let (font, size) = if style == 1.0 { ("EjariBold", 10) } else { ("EjariRegular", 8) };
        let x_pt = (x + 20.0) * 72.0 / 25.4;
        let y_pt = 792.0 - (top + 35.0) * 72.0 / 25.4;
        overlays[page as usize].push_str(&format!(
            "q\nBT\n0 0 0 rg\n/{font} {size} Tf\n24 TL\n1 0 0 1 {x_pt:.10} {y_pt:.10} Tm\n<{encoded}> Tj\nT*\nET\nQ\n"));
    }
    let mut doc = load_template(template)?;
    let regular = doc.add_object(dictionary! { "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica", "Encoding" => "WinAnsiEncoding" });
    let bold = doc.add_object(dictionary! { "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica-Bold", "Encoding" => "WinAnsiEncoding" });
    let result = (|| -> lopdf::Result<()> {
        for (index, page_id) in doc.get_pages().values().enumerate() {
            if overlays[index].is_empty() { continue; }
            // The pinned template has explicit page resources. Clone the font
            // dictionary as well to avoid changing resources shared by pages.
            let mut resources = doc.get_dictionary(*page_id)?.get_deref(b"Resources", &doc)?.as_dict()?.clone();
            let mut fonts = if resources.has(b"Font") {
                resources.get_deref(b"Font", &doc)?.as_dict()?.clone()
            } else { Dictionary::new() };
            if fonts.has(b"EjariRegular") || fonts.has(b"EjariBold") { return Err(lopdf::Error::Syntax("EJARI font name collision".into())); }
            fonts.set("EjariRegular", regular);
            fonts.set("EjariBold", bold);
            resources.set("Font", fonts);
            let begin = doc.add_object(Stream::new(Dictionary::new(), b"q\n".to_vec()));
            let end = doc.add_object(Stream::new(Dictionary::new(), b"Q\n".to_vec()));
            let overlay = doc.add_object(Stream::new(Dictionary::new(), overlays[index].as_bytes().to_vec()));
            let mut contents = vec![Object::Reference(begin)];
            contents.extend(doc.get_page_contents(*page_id).into_iter().map(Object::Reference));
            contents.extend([Object::Reference(end), Object::Reference(overlay)]);
            let page = doc.get_object_mut(*page_id)?.as_dict_mut()?;
            page.set("Resources", resources);
            page.set("Contents", contents);
        }
        Ok(())
    })();
    result.map_err(|e| JsValue::from_str(&format!("Could not fill EJARI template: {e}")))?;
    let mut output = Vec::new();
    doc.save_to(&mut output).map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(output)
}

/// A viewer-compatible export: three US Letter pages at 144 dpi. The browser
/// renders template artwork and values together; the PDF contains RGB images,
/// so it does not depend on text-layer/font support in the reader.
#[wasm_bindgen]
pub fn create_ejari_raster(rgba: &[u8]) -> Result<Vec<u8>, JsValue> {
    const WIDTH: usize = 1224;
    const HEIGHT: usize = 1584;
    const PAGE_BYTES: usize = WIDTH * HEIGHT * 4;
    if rgba.len() != PAGE_BYTES * 3 {
        return Err(JsValue::from_str("EJARI export requires three rendered 1224 by 1584 pages."));
    }
    let mut doc = lopdf::Document::with_version("1.4");
    let pages_id = doc.new_object_id();
    let mut kids = Vec::new();
    for pixels in rgba.chunks_exact(PAGE_BYTES) {
        let mut rgb = Vec::with_capacity(WIDTH * HEIGHT * 3);
        for pixel in pixels.chunks_exact(4) {
            let alpha = u32::from(pixel[3]);
            for channel in &pixel[..3] {
                rgb.push(((u32::from(*channel) * alpha + 255 * (255 - alpha) + 127) / 255) as u8);
            }
        }
        let mut image = Stream::new(dictionary! {
            "Type" => "XObject", "Subtype" => "Image", "Width" => WIDTH as i64,
            "Height" => HEIGHT as i64, "ColorSpace" => "DeviceRGB", "BitsPerComponent" => 8
        }, rgb);
        image.compress().map_err(|e| JsValue::from_str(&e.to_string()))?;
        let image_id = doc.add_object(image);
        let content_id = doc.add_object(Stream::new(Dictionary::new(), b"q\n612 0 0 792 0 0 cm\n/PageImage Do\nQ\n".to_vec()));
        let page_id = doc.add_object(dictionary! {
            "Type" => "Page", "Parent" => pages_id,
            "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
            "Resources" => dictionary! { "XObject" => dictionary! { "PageImage" => image_id } },
            "Contents" => content_id
        });
        kids.push(Object::Reference(page_id));
    }
    doc.objects.insert(pages_id, dictionary! { "Type" => "Pages", "Kids" => kids, "Count" => 3 }.into());
    let catalog = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
    doc.trailer.set("Root", catalog);
    let mut output = Vec::new();
    doc.save_to(&mut output).map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(output)
}
