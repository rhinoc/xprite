mod seq_join;
pub mod acf;
pub mod autocorr;
pub mod gray;
pub mod runlengths;
pub mod sigproc;

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct DetectResult {
    pub cols: i32,
    pub rows: i32,
    pub step_x: f64,
    pub step_y: f64,
    #[wasm_bindgen(getter_with_clone)]
    pub consensus: String,
}

fn size_close(ac_c: i64, ac_r: i64, rl_c: i64, rl_r: i64) -> bool {
    let tol_c = std::cmp::max(1, (0.01 * rl_c as f64).round_ties_even() as i64);
    let tol_r = std::cmp::max(1, (0.01 * rl_r as f64).round_ties_even() as i64);
    (ac_c - rl_c).abs() <= tol_c && (ac_r - rl_r).abs() <= tol_r
}

#[wasm_bindgen(js_name = detectFastAcRl)]
pub fn detect_fast_ac_rl(rgba: &[u8], w: usize, h: usize) -> DetectResult {
    let ac = autocorr::detect(rgba, w, h);
    let rl = runlengths::detect(rgba, w, h);
    if size_close(ac.cols as i64, ac.rows as i64, rl.cols, rl.rows)
        && rl.score_x.min(rl.score_y) >= 0.30
    {
        let cols = ((ac.cols as i64 + rl.cols) as f64 / 2.0).round_ties_even() as i64;
        let rows = ((ac.rows as i64 + rl.rows) as f64 / 2.0).round_ties_even() as i64;
        return DetectResult {
            cols: cols as i32,
            rows: rows as i32,
            step_x: w as f64 / cols as f64,
            step_y: h as f64 / rows as f64,
            consensus: "fast:ac+rl(S)".into(),
        };
    }
    DetectResult {
        cols: ac.cols as i32,
        rows: ac.rows as i32,
        step_x: ac.step_x,
        step_y: ac.step_y,
        consensus: "null".into(),
    }
}
