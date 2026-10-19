use fast_image_resize::{images::Image, pixels::U8x4, FilterType, PixelType, ResizeAlg, ResizeOptions, Resizer};

pub fn resize(rgba: Vec<u8>, width: u32, height: u32, target_width: u32, target_height: u32) -> Result<Vec<u8>, String> {
    let valid = |w: u32, h: u32| w > 0 && h > 0 && w <= 16_384 && h <= 16_384 && u64::from(w) * u64::from(h) <= crate::MAX_PIXELS as u64;
    if !valid(width, height) || !valid(target_width, target_height) {
        return Err("Use input and output dimensions up to 12 megapixels and 16384 pixels per side.".into());
    }
    if rgba.len() != width as usize * height as usize * 4 {
        return Err("Pixel buffer length does not match the image dimensions.".into());
    }
    // Bound separable-filter intermediate buffers, including extreme reshapes.
    if u64::from(width) * u64::from(target_height) > 24_000_000 || u64::from(target_width) * u64::from(height) > 24_000_000 {
        return Err("This resize needs too much memory. Choose a less extreme aspect ratio.".into());
    }
    if width == target_width && height == target_height { return Ok(rgba); }
    let source = Image::from_vec_u8(width, height, rgba, PixelType::U8x4).map_err(|e| e.to_string())?;
    let mut output = Image::new(target_width, target_height, PixelType::U8x4);
    let options = ResizeOptions::new().resize_alg(ResizeAlg::Convolution(FilterType::Lanczos3));
    // The resizer's default alpha multiplication/division avoids color fringes
    // from hidden RGB in transparent pixels. No image codec is compiled to WASM.
    // A typed call excludes unused pixel formats from the WASM binary.
    let source_view = source.typed_image::<U8x4>().ok_or("Invalid source pixel format.")?;
    let mut output_view = output.typed_image_mut::<U8x4>().ok_or("Invalid output pixel format.")?;
    Resizer::new().resize_typed(&source_view, &mut output_view, &options).map_err(|e| e.to_string())?;
    Ok(output.into_vec())
}
