// oxipng 的 WASM 封装：输入输出都是 PNG 字节流（oxipng 本质是 PNG 重压缩器）。
//
// opts:
//   effort   = 0..6  -> Options::from_preset（--opt 级别）
//   alpha    = 0/1   -> --alpha（清理全透明像素的隐藏 RGB）
//   zopfli   = 0/1   -> 使用 Zopfli 替代 libdeflate
//   strip    = 0/1   -> --strip safe（默认 1）

use std::ffi::CStr;
use std::os::raw::c_char;

use oxipng::{Deflater, Options, StripChunks};

static mut OUT: Vec<u8> = Vec::new();
static mut ERR: [u8; 256] = [0u8; 256];

fn set_error(msg: &str) {
    let bytes = msg.as_bytes();
    let n = bytes.len().min(255);
    unsafe {
        let buf = &mut *(&raw mut ERR);
        buf[..n].copy_from_slice(&bytes[..n]);
        buf[n] = 0;
    }
}

fn param<'a>(opts: &'a str, key: &str) -> Option<&'a str> {
    for seg in opts.split('&') {
        let mut it = seg.splitn(2, '=');
        if it.next() == Some(key) {
            return it.next();
        }
    }
    None
}

fn param_int(opts: &str, key: &str, def: i32) -> i32 {
    param(opts, key)
        .and_then(|v| v.parse::<i32>().ok())
        .unwrap_or(def)
}

fn param_flag(opts: &str, key: &str, def: bool) -> bool {
    match param(opts, key) {
        Some("1") | Some("true") | Some("yes") => true,
        Some("0") | Some("false") | Some("no") => false,
        Some(_) => true,
        None => def,
    }
}

#[no_mangle]
pub extern "C" fn ifb_alloc(size: i32) -> *mut u8 {
    let size = if size <= 0 { 1 } else { size as usize };
    let mut buf = vec![0u8; size];
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[no_mangle]
pub extern "C" fn ifb_free_ptr(ptr: *mut u8, size: i32) {
    if ptr.is_null() || size <= 0 {
        return;
    }
    unsafe {
        drop(Vec::from_raw_parts(ptr, size as usize, size as usize));
    }
}

#[no_mangle]
pub extern "C" fn ifb_encode(
    data: *const u8,
    len: i32,
    _w: i32,
    _h: i32,
    opts_ptr: *const c_char,
) -> i32 {
    unsafe {
        let buf = &mut *(&raw mut ERR);
        buf[0] = 0;
    }

    if data.is_null() || len <= 0 {
        set_error("invalid input");
        return -1;
    }

    let input = unsafe { std::slice::from_raw_parts(data, len as usize) };

    let opts_str = if opts_ptr.is_null() {
        String::new()
    } else {
        unsafe { CStr::from_ptr(opts_ptr) }
            .to_string_lossy()
            .into_owned()
    };

    let level = param_int(&opts_str, "effort", 2).clamp(0, 6) as u8;
    let mut opts = Options::from_preset(level);

    if param_flag(&opts_str, "strip", true) {
        opts.strip = StripChunks::Safe;
    } else {
        opts.strip = StripChunks::None;
    }
    opts.optimize_alpha = param_flag(&opts_str, "alpha", false);
    if param_flag(&opts_str, "zopfli", false) {
        opts.deflater = Deflater::Zopfli(Default::default());
    }

    match oxipng::optimize_from_memory(input, &opts) {
        Ok(out) => {
            unsafe {
                let slot = &mut *(&raw mut OUT);
                *slot = out;
            }
            0
        }
        Err(err) => {
            set_error(&format!("oxipng: {err}"));
            -1
        }
    }
}

#[no_mangle]
pub extern "C" fn ifb_out_ptr() -> *const u8 {
    unsafe { (*(&raw const OUT)).as_ptr() }
}

#[no_mangle]
pub extern "C" fn ifb_out_len() -> i32 {
    unsafe { (*(&raw const OUT)).len() as i32 }
}

#[no_mangle]
pub extern "C" fn ifb_out_free() {
    unsafe {
        let slot = &mut *(&raw mut OUT);
        slot.clear();
        slot.shrink_to_fit();
    }
}

#[no_mangle]
pub extern "C" fn ifb_error() -> *const c_char {
    unsafe { (*(&raw const ERR)).as_ptr() as *const c_char }
}

#[no_mangle]
pub extern "C" fn ifb_version() -> *const c_char {
    static VERSION: &[u8] = b"oxipng 10.2.1 (wasm32)\0";
    VERSION.as_ptr() as *const c_char
}
