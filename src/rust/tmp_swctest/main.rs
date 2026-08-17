use swc_core::common::{sync::Lrc, FileName, Globals, Mark, SourceMap, GLOBALS};
use swc_core::ecma::ast::EsVersion;
use swc_core::ecma::codegen::to_code_default;
use swc_core::ecma::parser::{Syntax, TsSyntax, parse_file_as_program};
use swc_core::ecma::transforms::base::{fixer, resolver};
use swc_core::ecma::transforms::typescript::strip;

fn main() {
    let src = "export function add(a: number, b: number): number { return a + b; }\nexport const x: number = 1;\nimport { y } from \"mod\";\nconsole.log(y);\nasync function asyncFn() { return 1; }\nexport { asyncFn };";
    let cm: Lrc<SourceMap> = Default::default();
    let fm = cm.new_source_file(FileName::Custom("entry.ts".into()).into(), src.to_string());
    let mut errors = Vec::new();
    let program = parse_file_as_program(
        &fm, Syntax::Typescript(TsSyntax::default()), EsVersion::latest(), None, &mut errors
    ).expect("parse failed");
    if !errors.is_empty() {
        for e in &errors { eprintln!("parse err: {e:?}"); }
    }
    GLOBALS.set(&Globals::default(), || {
        let unresolved = Mark::new();
        let top_level = Mark::new();
        let p = program.clone();
        // ESM: just strip types
        let esm = p
            .apply(resolver(unresolved, top_level, true))
            .apply(strip(unresolved, top_level))
            .apply(fixer::fixer(None));
        println!("=== ESM OUTPUT ===\n{}", to_code_default(cm.clone(), None, &esm));

        // CJS: strip + common_js
        use swc_core::ecma::transforms::module::{common_js, util::Config};
        let cjs = program
            .apply(resolver(unresolved, top_level, true))
            .apply(strip(unresolved, top_level))
            .apply(common_js(Default::default(), unresolved, Config::default(), Default::default()))
            .apply(fixer::fixer(None));
        println!("=== CJS OUTPUT ===\n{}", to_code_default(cm.clone(), None, &cjs));
    });
}