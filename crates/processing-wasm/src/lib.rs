mod inpaint;
mod resize;
mod composite;
mod raster_pdf;

pub const MAX_PIXELS: usize = 12_000_000;
pub const MAX_MASK_PIXELS: usize = 250_000;
pub const MAX_MASK_AREA: usize = 1_000_000;

pub fn validate(rgba: &[u8], mask: &[u8], width: usize, height: usize) -> Result<(), String> {
    let pixels = width.checked_mul(height).ok_or("Invalid image dimensions.")?;
    if width == 0 || height == 0 || width > 16_384 || height > 16_384 || pixels > MAX_PIXELS {
        return Err("Use an image up to 12 megapixels and 16384 pixels per side.".into());
    }
    if rgba.len() != pixels * 4 || mask.len() != pixels {
        return Err("Pixel or mask buffer length does not match the image dimensions.".into());
    }
    let count = mask.iter().filter(|&&v| v != 0).count();
    if count == pixels {
        return Err("Leave some surrounding pixels unselected to reconstruct the area.".into());
    }
    if count > MAX_MASK_PIXELS {
        return Err("Select a smaller area (up to 250000 pixels) and process in stages.".into());
    }
    if let Some((x0, y0, x1, y1)) = inpaint::bounds(mask, width) {
        if (x1 - x0 + 1) * (y1 - y0 + 1) > MAX_MASK_AREA {
            return Err("Keep the selected areas closer together and process in stages.".into());
        }
    }
    Ok(())
}

pub fn process(
    mut rgba: Vec<u8>, mask: &[u8], width: usize, height: usize, seed: u32,
    mut progress: impl FnMut(&str),
) -> Result<Vec<u8>, String> {
    validate(&rgba, mask, width, height)?;
    if !mask.iter().any(|&v| v != 0) { return Ok(rgba); }
    let original = rgba.clone();
    progress("Base fill");
    inpaint::base_fill(&mut rgba, mask, width, height);
    progress("Texture synthesis");
    inpaint::synthesize(&mut rgba, &original, mask, width, height, seed);
    Ok(rgba)
}

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn remove_watermark(
    rgba: Vec<u8>, mask: &[u8], width: u32, height: u32, seed: u32,
    progress: &js_sys::Function,
) -> Result<Vec<u8>, JsValue> {
    process(rgba, mask, width as usize, height as usize, seed, |phase| {
        let _ = progress.call1(&JsValue::NULL, &JsValue::from_str(phase));
    }).map_err(|message| JsValue::from_str(&message))
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn resize_rgba(rgba: Vec<u8>, width: u32, height: u32, target_width: u32, target_height: u32) -> Result<Vec<u8>, JsValue> {
    resize::resize(rgba, width, height, target_width, target_height)
        .map_err(|message| JsValue::from_str(&message))
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn composite_rgba(base: Vec<u8>, width: u32, height: u32, mark: &[u8], mark_width: u32, mark_height: u32, x: i32, y: i32, opacity: f64) -> Result<Vec<u8>, JsValue> {
    composite::composite(base, width, height, mark, mark_width, mark_height, x, y, opacity)
        .map_err(|message| JsValue::from_str(&message))
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn create_raster_pdf(rgba: &[u8], width: u32, height: u32, page_width: f64, page_height: f64) -> Result<Vec<u8>, JsValue> {
    raster_pdf::create(rgba, width, height, page_width, page_height)
        .map_err(|message| JsValue::from_str(&message))
}
