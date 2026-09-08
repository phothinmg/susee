use susee::detect_source_type;
use susee_bundler::susee_bundler;

fn main(){
    let js_entry = "__local__/cjs/index.cjs".to_string();
    let cwd = ".".to_string();
    let js_bundled = susee_bundler(js_entry, Some(cwd), None);
    let st = detect_source_type(&js_bundled.bundled_code).unwrap();
    println!("{:?}", st)
}