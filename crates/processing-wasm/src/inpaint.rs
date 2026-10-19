pub fn bounds(mask: &[u8], width: usize) -> Option<(usize, usize, usize, usize)> {
    let mut result: Option<(usize, usize, usize, usize)> = None;
    for (i, &value) in mask.iter().enumerate() {
        if value == 0 { continue; }
        let (x, y) = (i % width, i / width);
        result = Some(match result {
            None => (x, y, x, y),
            Some((x0, y0, x1, y1)) => (x0.min(x), y0.min(y), x1.max(x), y1.max(y)),
        });
    }
    result
}

fn neighbors(i: usize, w: usize, h: usize) -> impl Iterator<Item = usize> {
    let (x, y) = (i % w, i / w);
    [
        (x > 0).then(|| i - 1), (x + 1 < w).then(|| i + 1),
        (y > 0).then(|| i - w), (y + 1 < h).then(|| i + w),
    ].into_iter().flatten()
}

// Boundary-inward, distance-weighted RGB extrapolation. Alpha is preserved.
pub fn base_fill(data: &mut [u8], mask: &[u8], w: usize, h: usize) {
    let Some((x0, y0, x1, y1)) = bounds(mask, w) else { return; };
    let radius = ((((x1 - x0 + 1) * (y1 - y0 + 1)) as f64).sqrt() * 0.15)
        .ceil().clamp(6.0, 30.0) as isize;
    let mut flags: Vec<u8> = mask.iter().map(|&m| if m == 0 { 0 } else { 2 }).collect();
    let mut dist: Vec<f32> = mask.iter().map(|&m| if m == 0 { 0.0 } else { 1e6 }).collect();
    let mut band = Vec::new();
    for i in 0..mask.len() {
        if flags[i] == 2 && neighbors(i, w, h).any(|n| flags[n] == 0) {
            flags[i] = 1;
            dist[i] = 1.0;
            band.push(i);
        }
    }
    while !band.is_empty() {
        let mut next = Vec::new();
        for i in band {
            let (cx, cy) = ((i % w) as isize, (i / w) as isize);
            let current = dist[i] as f64;
            let safe = |x: isize, y: isize| -> f64 {
                if x < 0 || x >= w as isize || y < 0 || y >= h as isize { return current; }
                let d = dist[y as usize * w + x as usize];
                if d < 1e5 { d as f64 } else { current }
            };
            let mut gx = (safe(cx + 1, cy) - safe(cx - 1, cy)) * 0.5;
            let mut gy = (safe(cx, cy + 1) - safe(cx, cy - 1)) * 0.5;
            let length = (gx * gx + gy * gy).sqrt() + 1e-6;
            gx /= length;
            gy /= length;
            let mut channels = [0.0; 3];
            let mut weight_sum = 0.0;
            for dy in -radius..=radius {
                let ny = cy + dy;
                if ny < 0 || ny >= h as isize { continue; }
                for dx in -radius..=radius {
                    let nx = cx + dx;
                    if nx < 0 || nx >= w as isize { continue; }
                    let n = ny as usize * w + nx as usize;
                    let d2 = dx * dx + dy * dy;
                    if flags[n] != 0 || d2 == 0 || d2 > radius * radius { continue; }
                    let distance = (d2 as f64).sqrt();
                    let weight = (((-(dx as f64) * gx - dy as f64 * gy).abs() / distance) + 0.01)
                        / d2 as f64 / (1.0 + (current - dist[n] as f64).abs());
                    for c in 0..3 {
                        let center = data[n * 4 + c] as f64;
                        let value = |x: isize, y: isize| -> f64 {
                            if x < 0 || x >= w as isize || y < 0 || y >= h as isize { return center; }
                            let ni = y as usize * w + x as usize;
                            if flags[ni] == 0 { data[ni * 4 + c] as f64 } else { center }
                        };
                        let ix = (value(nx + 1, ny) - value(nx - 1, ny)) * 0.5;
                        let iy = (value(nx, ny + 1) - value(nx, ny - 1)) * 0.5;
                        channels[c] += weight * (center - (dx as f64 * ix + dy as f64 * iy) * 0.5).clamp(0.0, 255.0);
                    }
                    weight_sum += weight;
                }
            }
            if weight_sum > 0.0 {
                for c in 0..3 { data[i * 4 + c] = (channels[c] / weight_sum).round().clamp(0.0, 255.0) as u8; }
            }
            flags[i] = 0;
            for n in neighbors(i, w, h) {
                if flags[n] == 2 {
                    flags[n] = 1;
                    dist[n] = current as f32 + 1.0;
                    next.push(n);
                }
            }
        }
        band = next;
    }
}

struct Random(u32);
impl Random {
    fn next(&mut self) -> f64 {
        let mut x = self.0;
        x ^= x << 13; x ^= x >> 17; x ^= x << 5;
        self.0 = x;
        x as f64 / 4_294_967_296.0
    }
    fn index(&mut self, len: usize) -> usize { (self.next() * len as f64) as usize }
}

fn clean(mask: &[u8], w: usize, x: usize, y: usize, block: usize) -> bool {
    (y..y + block).all(|row| mask[row * w + x..row * w + x + block].iter().all(|&v| v == 0))
}

fn ssd(data: &[u8], original: &[u8], mask: &[u8], w: usize, target: (usize, usize), source: usize, block: usize) -> f64 {
    let mut sum = 0.0;
    for by in (0..block).step_by(2) {
        for bx in (0..block).step_by(2) {
            let t = (target.1 + by) * w + target.0 + bx;
            let s = source + by * w + bx;
            let weight = if mask[t] != 0 { 0.3 } else { 1.0 };
            for c in 0..3 {
                let d = data[t * 4 + c] as f64 - original[s * 4 + c] as f64;
                sum += d * d * weight;
            }
        }
    }
    sum
}

// Seeded PatchMatch-style propagation and feathered voting. Every candidate
// source is checked against the mask, including propagated/random candidates.
pub fn synthesize(data: &mut [u8], original: &[u8], mask: &[u8], w: usize, h: usize, seed: u32) {
    let Some((x0, y0, x1, y1)) = bounds(mask, w) else { return; };
    let (mw, mh) = (x1 - x0 + 1, y1 - y0 + 1);
    let block = (((mw * mh) as f64).sqrt() * 0.035).ceil().clamp(5.0, 12.0) as usize;
    if w < block || h < block { return; }
    let overlap = 2.max(block / 2);
    let step = (block - overlap).max(1);
    let pad = (block * 3).max((mw.max(mh) as f64 * 0.6).ceil() as usize);
    let (sx0, sy0) = (x0.saturating_sub(pad), y0.saturating_sub(pad));
    let (sx1, sy1) = ((w - block).min(x1 + pad), (h - block).min(y1 + pad));
    let mut rng = Random(if seed == 0 { 0x9e3779b9 } else { seed });
    let mut sources = Vec::new();
    let mut count = 0;
    for y in (sy0..=sy1).step_by(2.max(block / 2)) {
        for x in (sx0..=sx1).step_by(2.max(block / 2)) {
            if !clean(mask, w, x, y, block) { continue; }
            count += 1;
            if sources.len() < 800 { sources.push(y * w + x); }
            else {
                let index = rng.index(count);
                if index < 800 { sources[index] = y * w + x; }
            }
        }
    }
    if sources.is_empty() { return; }
    let mut targets = Vec::new();
    for y in (y0.saturating_sub(overlap)..=y1.min(h - block)).step_by(step) {
        for x in (x0.saturating_sub(overlap)..=x1.min(w - block)).step_by(step) {
            if !clean(mask, w, x, y, block) { targets.push((x, y)); }
        }
    }
    let mut matches = Vec::with_capacity(targets.len());
    let mut distances = Vec::with_capacity(targets.len());
    for &target in &targets {
        let source = sources[rng.index(sources.len())];
        matches.push(source);
        distances.push(ssd(data, original, mask, w, target, source, block));
    }
    for iteration in 0..3 {
        for scan in 0..targets.len() {
            let i = if iteration % 2 == 0 { scan } else { targets.len() - 1 - scan };
            let target = targets[i];
            let direction = if iteration % 2 == 0 { -1 } else { 1 };
            // Same-row and approximate vertical propagation, as in the original.
            for offset in [1, mw.div_ceil(step)] {
                let ni = i as isize + direction * offset as isize;
                if ni < 0 || ni >= targets.len() as isize { continue; }
                let ni = ni as usize;
                let nx = (matches[ni] % w) as isize + target.0 as isize - targets[ni].0 as isize;
                let ny = (matches[ni] / w) as isize + target.1 as isize - targets[ni].1 as isize;
                if nx < 0 || ny < 0 || nx as usize + block > w || ny as usize + block > h { continue; }
                let (nx, ny) = (nx as usize, ny as usize);
                if !clean(mask, w, nx, ny, block) { continue; }
                let source = ny * w + nx;
                let d = ssd(data, original, mask, w, target, source, block);
                if d < distances[i] { matches[i] = source; distances[i] = d; }
            }
            let (cx, cy) = ((matches[i] % w) as isize, (matches[i] / w) as isize);
            let mut radius = (sx1 - sx0).max(sy1 - sy0);
            for _ in 0..6 {
                if radius < 1 { break; }
                // floor(x + .5) matches Math.round for negative offsets too.
                let nx = cx + ((rng.next() * 2.0 - 1.0) * radius as f64 + 0.5).floor() as isize;
                let ny = cy + ((rng.next() * 2.0 - 1.0) * radius as f64 + 0.5).floor() as isize;
                if nx >= sx0 as isize && ny >= sy0 as isize && nx <= sx1 as isize && ny <= sy1 as isize {
                    let (nx, ny) = (nx as usize, ny as usize);
                    if clean(mask, w, nx, ny, block) {
                        let source = ny * w + nx;
                        let d = ssd(data, original, mask, w, target, source, block);
                        if d < distances[i] { matches[i] = source; distances[i] = d; }
                    }
                }
                radius /= 2;
            }
        }
    }
    // Accumulators cover only the mask bounding box, rather than the full image.
    let mut sums = vec![[0.0f32; 4]; mw * mh];
    for (i, &(tx, ty)) in targets.iter().enumerate() {
        let source = matches[i];
        for by in 0..block {
            for bx in 0..block {
                let (x, y) = (tx + bx, ty + by);
                let t = y * w + x;
                if mask[t] == 0 { continue; }
                let feather = ((bx.min(block - 1 - bx) + 1) * (by.min(block - 1 - by) + 1)) as f32;
                let sum = &mut sums[(y - y0) * mw + x - x0];
                for c in 0..3 { sum[c] += original[(source + by * w + bx) * 4 + c] as f32 * feather; }
                sum[3] += feather;
            }
        }
    }
    for y in y0..=y1 {
        for x in x0..=x1 {
            let i = y * w + x;
            let sum = sums[(y - y0) * mw + x - x0];
            if mask[i] == 0 || sum[3] < 0.01 { continue; }
            for c in 0..3 {
                data[i * 4 + c] = ((sum[c] / sum[3]) as f64 * 0.7 + data[i * 4 + c] as f64 * 0.3).round().clamp(0.0, 255.0) as u8;
            }
        }
    }
}
