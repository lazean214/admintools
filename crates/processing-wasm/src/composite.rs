// Straight-alpha source-over composition. Only the intersecting stamp region is
// visited; transparent stamp pixels preserve the destination bytes exactly.
pub fn composite(mut base: Vec<u8>, width: u32, height: u32, mark: &[u8], mark_width: u32, mark_height: u32, x: i32, y: i32, opacity: f64) -> Result<Vec<u8>, String> {
    let valid = |w: u32, h: u32, len: usize| w > 0 && h > 0 && w <= 16_384 && h <= 16_384
        && u64::from(w) * u64::from(h) <= crate::MAX_PIXELS as u64
        && len as u64 == u64::from(w) * u64::from(h) * 4;
    if !valid(width, height, base.len()) || !valid(mark_width, mark_height, mark.len()) {
        return Err("Invalid watermark dimensions or pixel buffer length.".into());
    }
    if !opacity.is_finite() || !(0.0..=1.0).contains(&opacity) {
        return Err("Watermark opacity must be between 0 and 1.".into());
    }
    if opacity == 0.0 { return Ok(base); }
    let left = i64::from(x).max(0);
    let top = i64::from(y).max(0);
    let right = (i64::from(x) + i64::from(mark_width)).min(i64::from(width));
    let bottom = (i64::from(y) + i64::from(mark_height)).min(i64::from(height));
    for by in top..bottom {
        for bx in left..right {
            let dst = (by as usize * width as usize + bx as usize) * 4;
            let src = ((by - i64::from(y)) as usize * mark_width as usize + (bx - i64::from(x)) as usize) * 4;
            let sa = f64::from(mark[src + 3]) / 255.0 * opacity;
            if sa == 0.0 { continue; }
            let remaining = f64::from(base[dst + 3]) / 255.0 * (1.0 - sa);
            let alpha = sa + remaining;
            for c in 0..3 {
                base[dst + c] = ((f64::from(mark[src + c]) * sa + f64::from(base[dst + c]) * remaining) / alpha).round().clamp(0.0, 255.0) as u8;
            }
            base[dst + 3] = (alpha * 255.0).round().clamp(0.0, 255.0) as u8;
        }
    }
    Ok(base)
}
