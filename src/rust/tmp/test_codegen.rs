use oxc::allocator::Allocator;
use oxc::codegen::{Codegen, CodegenOptions, IndentChar};
use oxc::parser::Parser;
use oxc::semantic::SemanticBuilder;
use oxc::span::SourceType;
use oxc::transformer::{EnvOptions, Module, TransformOptions, Transformer};
use std::path::Path;

fn main() {
    let src = "export function add(a: number, b: number): number { return a + b; }\nexport const x: number = 1;\nimport { y } from \"mod\";\nconsole.log(y);";
    let path = Path::new("entry.ts");
    let st = SourceType::from_path(path).unwrap().with_module(true);
    println!("source_type module={}", st.is_module());

    let alloc = Allocator::default();
    let pr = Parser::new(&alloc, src, st).parse();
    let mut program = pr.program;
    let sem = SemanticBuilder::new_compiler().build(&program);
    let scoping = sem.semantic.into_scoping();
    let mut env = EnvOptions::default();
    env.module = Module::CommonJS;
    let opts = TransformOptions { env, ..TransformOptions::default() };
    let tret = Transformer::new(&alloc, path, &opts).build_with_scoping(scoping, &mut program);
    if tret.diagnostics.has_errors() {
        for d in &tret.diagnostics { eprintln!("transform: {d}"); }
    }
    let code = Codegen::new()
        .with_options(CodegenOptions { indent_char: IndentChar::Space, indent_width: 4, ..CodegenOptions::default() })
        .build(&program).code;
    println!("=== JS (CommonJS, module=true) ===\n{code}");
}
