use lopdf::{content::Content, dictionary, Dictionary, Document, Object, ObjectId, Stream, StringFormat};
use wasm_bindgen::prelude::*;

const CONTENT_LIMIT: usize = 4 * 1024 * 1024;
fn error(message: impl ToString) -> JsValue { JsValue::from_str(&message.to_string()) }
fn json(value: &str) -> String {
    let mut out = String::from("\"");
    for c in value.chars() {
        match c { '"' => out.push_str("\\\""), '\\' => out.push_str("\\\\"), c if c < ' ' => out.push_str(&format!("\\u{:04x}", c as u32)), c => out.push(c) }
    }
    out.push('"'); out
}
fn number(value: f64, min: f64, max: f64) -> Result<(), JsValue> {
    if !value.is_finite() || !(min..=max).contains(&value) { Err(error("Invalid editor dimensions or style.")) } else { Ok(()) }
}
fn inherited(doc: &Document, mut page: ObjectId, key: &[u8]) -> lopdf::Result<Object> {
    for _ in 0..64 {
        let dict = doc.get_dictionary(page)?;
        if let Ok(value) = dict.get_deref(key, doc) { return Ok(value.clone()); }
        page = dict.get(b"Parent")?.as_reference()?;
    }
    Err(lopdf::Error::Syntax("Page inheritance exceeds the limit".into()))
}
fn read_strings(doc: &Document, page: ObjectId, content: &Content) -> Vec<(usize, String, Vec<u8>)> {
    let fonts = doc.get_page_fonts(page).unwrap_or_default();
    let encodings: std::collections::BTreeMap<_,_> = fonts.iter().filter_map(|(name,font)| font.get_font_encoding_with_limit(doc,1024*1024).ok().map(|encoding|(name.clone(),encoding))).collect();
    let mut current = Vec::new();
    let mut stack = Vec::new();
    let mut result = Vec::new();
    for (index, op) in content.operations.iter().enumerate() {
        match op.operator.as_str() {
            "q" => stack.push(current.clone()),
            "Q" => { if let Some(font) = stack.pop() { current = font; } },
            "Tf" => current = op.operands.first().and_then(|o| o.as_name().ok()).unwrap_or_default().to_vec(),
            "Tj" | "TJ" | "'" | "\"" => {
                let Some(encoding) = encodings.get(&current) else { continue; };
                let operand = op.operands.get(if op.operator == "\"" { 2 } else { 0 });
                let mut text = String::new();
                let mut valid = true;
                if let Some(value) = operand {
                    let values = if let Object::Array(values) = value { values.as_slice() } else { std::slice::from_ref(value) };
                    for value in values {
                        if let Object::String(bytes, _) = value {
                            match encoding.bytes_to_string(bytes) { Ok(value) => text.push_str(&value), Err(_) => valid = false }
                        }
                    }
                }
                if valid && !text.trim().is_empty() && !text.contains('\u{fffd}') && text.len() <= 4096 {
                    result.push((index, text, current.clone()));
                    if result.len() >= 2000 { break; }
                }
            },
            _ => {}
        }
    }
    result
}

#[wasm_bindgen]
pub struct PdfEditorDocument { doc: Document, pages: Vec<ObjectId>, changed: usize }

#[wasm_bindgen]
impl PdfEditorDocument {
    #[wasm_bindgen(constructor)]
    pub fn new(bytes: &[u8]) -> Result<PdfEditorDocument, JsValue> {
        if bytes.is_empty() || bytes.len() > 32 * 1024 * 1024 { return Err(error("Choose a PDF no larger than 32 MB.")); }
        let mut doc = Document::load_mem_with_options(bytes, lopdf::LoadOptions { max_decompressed_size: Some(8 * 1024 * 1024), ..Default::default() }).map_err(error)?;
        doc.version = "1.7".into();
        if doc.is_encrypted() { return Err(error("Password-protected PDFs are not supported. Open an unlocked copy.")); }
        let pages: Vec<_> = doc.get_pages().values().copied().collect();
        if pages.is_empty() || pages.len() > 100 || doc.objects.len() > 100_000 { return Err(error("The editor supports PDFs with 1 to 100 pages and at most 100000 objects.")); }
        if doc.objects.values().any(|obj| obj.as_dict().is_ok_and(|d| d.get(b"FT").is_ok_and(|v| v.as_name().is_ok_and(|n| n == b"Sig")))) {
            return Err(error("Signed PDFs cannot be edited without invalidating their signatures. Use an unsigned copy."));
        }
        Ok(Self { doc, pages, changed: 0 })
    }

    pub fn inspect(&self, page: u32) -> Result<String, JsValue> {
        let id = self.page(page)?;
        let content = self.content(id)?;
        let texts = read_strings(&self.doc, id, &content).into_iter().map(|(index,text,font)| {
            format!("{{\"id\":{index},\"text\":{},\"font\":{}}}", json(&text), json(&String::from_utf8_lossy(&font)))
        }).collect::<Vec<_>>();
        let resources = self.resources(id)?;
        let mut images = Vec::new();
        if let Ok(objects) = resources.get_deref(b"XObject", &self.doc).and_then(Object::as_dict) {
            for (name,value) in objects.iter() {
                let value = match value { Object::Reference(id) => self.doc.get_object(*id).map_err(error)?, _ => value };
                if let Ok(stream) = value.as_stream() {
                    if stream.dict.get(b"Subtype").is_ok_and(|o| o.as_name().is_ok_and(|v| v == b"Image")) {
                        let width = stream.dict.get(b"Width").and_then(Object::as_i64).unwrap_or(0);
                        let height = stream.dict.get(b"Height").and_then(Object::as_i64).unwrap_or(0);
                        images.push(format!("{{\"name\":{},\"width\":{width},\"height\":{height}}}", json(&String::from_utf8_lossy(name))));
                    }
                }
            }
        }
        Ok(format!("{{\"texts\":[{}],\"images\":[{}]}}", texts.join(","), images.join(",")))
    }

    pub fn replace_text(&mut self, page: u32, index: u32, expected: &str, replacement: &str) -> Result<(), JsValue> {
        self.budget()?;
        if expected.len() > 4096 || replacement.len() > 4096 || replacement.chars().any(|c| c.is_control()) { return Err(error("Use a single line of at most 4096 bytes.")); }
        let id = self.page(page)?;
        let mut content = self.content(id)?;
        let (_, actual, font_name) = read_strings(&self.doc,id,&content).into_iter().find(|(i,_,_)| *i == index as usize).ok_or_else(|| error("This text run cannot be edited safely."))?;
        if actual != expected { return Err(error("Text changed since it was selected. Reopen the original PDF.")); }
        let fonts = self.doc.get_page_fonts(id).map_err(error)?;
        let font = fonts.get(&font_name).ok_or_else(|| error("Original font was not found."))?;
        let encoding = font.get_font_encoding_with_limit(&self.doc, 1024 * 1024).map_err(error)?;
        let encoded = encoding.string_to_bytes(replacement);
        if encoding.bytes_to_string(&encoded).map_err(error)? != replacement { return Err(error("The original font lacks some replacement characters. Choose characters available in that font, or add a new text layer.")); }
        if font.get(b"BaseFont").and_then(Object::as_name).is_ok_and(|n| n.contains(&b'+')) && font.get(b"Subtype").and_then(Object::as_name).is_ok_and(|n| n != b"Type0") {
            let first = font.get(b"FirstChar").and_then(Object::as_i64).unwrap_or(0);
            if let Ok(widths) = font.get_deref(b"Widths", &self.doc).and_then(Object::as_array) {
                if encoded.iter().any(|b| (i64::from(*b)-first).try_into().ok().and_then(|i:usize| widths.get(i)).and_then(|v| v.as_float().ok()).is_none_or(|w| w <= 0.0)) {
                    return Err(error("The original embedded font does not contain a needed glyph. Add a new text layer instead."));
                }
            }
        }
        let op = &mut content.operations[index as usize];
        let value = Object::String(encoded, StringFormat::Hexadecimal);
        if op.operator == "TJ" { op.operands = vec![Object::Array(vec![value])]; }
        else { let operand = if op.operator == "\"" { 2 } else { 0 }; op.operands[operand] = value; }
        let stream = self.doc.add_object(Stream::new(Dictionary::new(), content.encode().map_err(error)?));
        self.doc.get_dictionary_mut(id).map_err(error)?.set("Contents", stream);
        Ok(())
    }

    /// Reconstruct a page without retaining its scanned bitmap or original text.
    pub fn clear_page(&mut self, page: u32) -> Result<(), JsValue> {
        self.budget()?;
        let id = self.page(page)?;
        let content = self.doc.add_object(Stream::new(Dictionary::new(), Vec::new()));
        let dict = self.doc.get_dictionary_mut(id).map_err(error)?;
        dict.set("Contents", content);
        dict.set("Resources", Dictionary::new());
        dict.remove(b"Annots");
        Ok(())
    }

    pub fn add_text(&mut self, page: u32, bytes: &[u8], x: f64, y: f64, size: f64, bold: bool, color: &[f64]) -> Result<(), JsValue> {
        self.budget()?; self.position(x,y)?; number(size,4.0,200.0)?; Self::color(color)?;
        if bytes.len() > 4096 || bytes.iter().any(|b| *b < 32 || *b == 127) { return Err(error("Invalid added text.")); }
        let id = self.page(page)?;
        let font_id = self.doc.add_object(dictionary! { "Type"=>"Font", "Subtype"=>"Type1", "BaseFont"=>if bold {"Helvetica-Bold"} else {"Helvetica"}, "Encoding"=>"WinAnsiEncoding" });
        let name = format!("EditorFont{}", font_id.0);
        self.resource(id,b"Font",&name,font_id)?;
        let hex: String = bytes.iter().map(|b| format!("{b:02X}")).collect();
        self.append(id,format!("q\nBT\n{} {} {} rg\n/{name} {size} Tf\n0 Tc\n0 Tw\n100 Tz\n0 Ts\n0 Tr\n1 0 0 1 {x} {y} Tm\n<{hex}> Tj\nET\nQ\n", color[0],color[1],color[2]).into_bytes())
    }

    pub fn add_shape(&mut self, page: u32, x: f64, y: f64, width: f64, height: f64, color: &[f64], opacity: f64, stroke: f64, kind: u32) -> Result<(), JsValue> {
        self.budget()?; self.position(x,y)?; number(width,-14400.0,14400.0)?; number(height,-14400.0,14400.0)?; Self::color(color)?; number(opacity,0.0,1.0)?; number(stroke,0.0,50.0)?;
        let id = self.page(page)?;
        let gs = self.doc.add_object(dictionary! {"Type"=>"ExtGState", "ca"=>opacity as f32, "CA"=>opacity as f32});
        let name = format!("EditorAlpha{}",gs.0);
        self.resource(id,b"ExtGState",&name,gs)?;
        let paint = if stroke>0.0 {"S"} else {"f"};
        let path = match kind {
            0 => format!("{x} {y} {width} {height} re {paint}"),
            1 => format!("{x} {y} m {} {} l S",x+width,y+height),
            2 => {
                let (cx,cy,rx,ry)=(x+width/2.0,y+height/2.0,width/2.0,height/2.0);
                let (kx,ky)=(rx*0.5522847498,ry*0.5522847498);
                format!("{} {cy} m {} {} {} {} {cx} {} c {} {} {} {} {} {cy} c {} {} {} {} {cx} {} c {} {} {} {} {} {cy} c h {paint}",cx+rx,cx+rx,cy+ky,cx+kx,cy+ry,cy+ry,cx-kx,cy+ry,cx-rx,cy+ky,cx-rx,cx-rx,cy-ky,cx-kx,cy-ry,cy-ry,cx+kx,cy-ry,cx+rx,cy-ky,cx+rx)
            },
            _ => return Err(error("Unknown shape.")),
        };
        self.append(id,format!("q\n/{name} gs\n{} {} {} rg\n{} {} {} RG\n{stroke} w\n{path}\nQ\n",color[0],color[1],color[2],color[0],color[1],color[2]).into_bytes())
    }

    pub fn add_link(&mut self, page:u32,x:f64,y:f64,width:f64,height:f64,url:&str) -> Result<(),JsValue> {
        self.budget()?; self.position(x,y)?; number(width,1.0,14400.0)?;number(height,1.0,14400.0)?;
        if url.len()>2048 || !(url.starts_with("https://") || url.starts_with("http://") || url.starts_with("mailto:")) || url.chars().any(|c| c.is_control()) {return Err(error("Use an http, https or mailto link."));}
        let id=self.page(page)?;
        let annotation=self.doc.add_object(dictionary!{
            "Type"=>"Annot","Subtype"=>"Link","Rect"=>vec![Object::Real(x as f32),Object::Real(y as f32),Object::Real((x+width) as f32),Object::Real((y+height) as f32)],
            "Border"=>vec![0.into(),0.into(),0.into()],"P"=>id,
            "A"=>dictionary!{"Type"=>"Action","S"=>"URI","URI"=>Object::string_literal(url)}
        });
        let mut annotations=self.doc.get_dictionary(id).map_err(error)?.get_deref(b"Annots",&self.doc).and_then(Object::as_array).cloned().unwrap_or_default();
        annotations.push(annotation.into());
        self.doc.get_dictionary_mut(id).map_err(error)?.set("Annots",annotations);
        Ok(())
    }

    pub fn add_path(&mut self,page:u32,points:&[f64],color:&[f64],stroke:f64) -> Result<(),JsValue> {
        self.budget()?; Self::color(color)?;number(stroke,0.1,50.0)?;
        if points.len()<4 || points.len()>2048 || points.len()%2!=0 {return Err(error("Invalid drawing path."));}
        let mut path=String::new();
        for (index,pair) in points.chunks_exact(2).enumerate() {self.position(pair[0],pair[1])?;path.push_str(&format!("{} {} {}\n",pair[0],pair[1],if index==0 {"m"} else {"l"}));}
        let id=self.page(page)?;
        self.append(id,format!("q\n{} {} {} RG\n{stroke} w\n1 J\n1 j\n{path}S\nQ\n",color[0],color[1],color[2]).into_bytes())
    }

    pub fn add_image(&mut self, page: u32, rgba: &[u8], width: u32, height: u32, x: f64, y: f64, draw_width: f64, draw_height: f64) -> Result<(), JsValue> {
        self.budget()?; self.position(x,y)?; number(draw_width,1.0,14400.0)?; number(draw_height,1.0,14400.0)?;
        let id = self.page(page)?;
        let image = self.image(rgba,width,height)?;
        let name = format!("EditorImage{}",image.0);
        self.resource(id,b"XObject",&name,image)?;
        self.append(id,format!("q\n{draw_width} 0 0 {draw_height} {x} {y} cm\n/{name} Do\nQ\n").into_bytes())
    }

    pub fn replace_image(&mut self, page: u32, name: &str, rgba: &[u8], width: u32, height: u32) -> Result<(), JsValue> {
        self.budget()?;
        let id = self.page(page)?;
        let resources = self.resources(id)?;
        let objects = resources.get_deref(b"XObject", &self.doc).and_then(Object::as_dict).map_err(error)?;
        let original = objects.get_deref(name.as_bytes(), &self.doc).and_then(Object::as_stream).map_err(error)?;
        if !original.dict.get(b"Subtype").and_then(Object::as_name).is_ok_and(|v| v == b"Image") { return Err(error("Select a direct page image.")); }
        let image = self.image(rgba,width,height)?;
        self.resource(id,b"XObject",name,image)
    }

    pub fn finish(&mut self, order: &[u32], rotations: &[u32]) -> Result<Vec<u8>, JsValue> {
        if order.is_empty() || order.len() > self.pages.len() || rotations.len() != order.len() { return Err(error("Keep at least one page.")); }
        let mut seen = std::collections::BTreeSet::new();
        let mut ids = Vec::new();
        for (index,page) in order.iter().enumerate() {
            if !seen.insert(*page) || ![0,90,180,270].contains(&rotations[index]) { return Err(error("Invalid page order or rotation.")); }
            ids.push(self.page(*page)?);
        }
        let root_pages = self.doc.new_object_id();
        for (index,id) in ids.iter().enumerate() {
            for key in [b"Resources".as_slice(),b"MediaBox",b"CropBox"] {
                if let Ok(value) = inherited(&self.doc,*id,key) { self.doc.get_dictionary_mut(*id).map_err(error)?.set(key,value); }
            }
            let page = self.doc.get_dictionary_mut(*id).map_err(error)?;
            page.set("Parent",root_pages); page.set("Rotate",rotations[index] as i64);
        }
        self.doc.objects.insert(root_pages,dictionary! { "Type"=>"Pages", "Kids"=>ids.into_iter().map(Object::Reference).collect::<Vec<_>>(), "Count"=>order.len() as i64 }.into());
        self.doc.catalog_mut().map_err(error)?.set("Pages",root_pages);
        self.doc.catalog_mut().map_err(error)?.remove(b"PageLabels");
        self.doc.prune_objects();
        let mut bytes = Vec::new(); self.doc.save_to(&mut bytes).map_err(error)?;
        if bytes.len() > 128*1024*1024 { return Err(error("Edited PDF exceeds 128 MB.")); }
        Ok(bytes)
    }
}

impl PdfEditorDocument {
    fn page(&self, index: u32) -> Result<ObjectId, JsValue> { self.pages.get(index as usize).copied().ok_or_else(|| error("Page not found.")) }
    fn content(&self, id: ObjectId) -> Result<Content, JsValue> {
        let data = self.doc.get_page_content_with_limit(id,CONTENT_LIMIT).map_err(error)?;
        let content = Content::decode(&data).map_err(error)?;
        if content.operations.len() > 100_000 { return Err(error("This page is too complex to edit.")); }
        Ok(content)
    }
    fn resources(&self, id: ObjectId) -> Result<Dictionary, JsValue> {
        match inherited(&self.doc,id,b"Resources") { Ok(value) => value.as_dict().cloned().map_err(error), Err(_) => Ok(Dictionary::new()) }
    }
    fn resource(&mut self, id: ObjectId, kind: &[u8], name: &str, value: ObjectId) -> Result<(), JsValue> {
        let mut resources = self.resources(id)?;
        let mut dict = if resources.has(kind) {resources.get_deref(kind,&self.doc).and_then(Object::as_dict).map_err(error)?.clone()} else {Dictionary::new()};
        dict.set(name,value); resources.set(kind,dict);
        self.doc.get_dictionary_mut(id).map_err(error)?.set("Resources",resources); Ok(())
    }
    fn append(&mut self, id: ObjectId, bytes: Vec<u8>) -> Result<(), JsValue> {
        let begin = self.doc.add_object(Stream::new(Dictionary::new(),b"q\n".to_vec()));
        let end = self.doc.add_object(Stream::new(Dictionary::new(),b"Q\n".to_vec()));
        let overlay = self.doc.add_object(Stream::new(Dictionary::new(),bytes));
        let mut contents = vec![Object::Reference(begin)];
        contents.extend(self.doc.get_page_contents(id).into_iter().map(Object::Reference));
        contents.extend([Object::Reference(end),Object::Reference(overlay)]);
        self.doc.get_dictionary_mut(id).map_err(error)?.set("Contents",contents); Ok(())
    }
    fn image(&mut self, rgba: &[u8], width: u32, height: u32) -> Result<ObjectId, JsValue> {
        let pixels = u64::from(width)*u64::from(height);
        if width==0 || height==0 || width>16384 || height>16384 || pixels>12_000_000 || rgba.len() as u64 != pixels*4 {return Err(error("Images must be at most 12 megapixels."));}
        let mut rgb = Vec::with_capacity(pixels as usize*3); let mut alpha = Vec::with_capacity(pixels as usize);
        let mut transparent = false;
        for p in rgba.chunks_exact(4) {rgb.extend_from_slice(&p[..3]);alpha.push(p[3]);transparent |= p[3]!=255;}
        let mut dict = dictionary! {"Type"=>"XObject","Subtype"=>"Image","Width"=>width as i64,"Height"=>height as i64,"ColorSpace"=>"DeviceRGB","BitsPerComponent"=>8};
        if transparent {
            let mut mask = Stream::new(dictionary! {"Type"=>"XObject","Subtype"=>"Image","Width"=>width as i64,"Height"=>height as i64,"ColorSpace"=>"DeviceGray","BitsPerComponent"=>8},alpha);
            mask.compress().map_err(error)?; dict.set("SMask",self.doc.add_object(mask));
        }
        let mut image = Stream::new(dict,rgb); image.compress().map_err(error)?; Ok(self.doc.add_object(image))
    }
    fn budget(&mut self) -> Result<(), JsValue> { self.changed+=1; if self.changed>500 { Err(error("The editor supports at most 500 changes per export.")) } else { Ok(()) } }
    fn position(&self, x:f64,y:f64) -> Result<(),JsValue> {number(x,-14400.0,28800.0)?;number(y,-14400.0,28800.0)}
    fn color(color:&[f64]) -> Result<(),JsValue> {if color.len()!=3 {return Err(error("Invalid color."));} for v in color {number(*v,0.0,1.0)?;} Ok(())}
}
