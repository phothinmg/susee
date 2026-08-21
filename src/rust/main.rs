use susee::build;

// fn print_opts(label: &str, opts: &CompilerOptions) {
//     println!("--- {label} ---");
//     println!("  out_dir          : {}", opts.out_dir);
//     println!("  module           : {:?}", opts.module);
//     println!("  target           : {}", opts.target);
//     println!("  jsx              : {:?}", opts.jsx);
//     println!("  jsx_import_source: {:?}", opts.jsx_import_source);
//     println!("  lib              : {:?}", opts.lib);
//     println!("  allow_js         : {}", opts.allow_js);
//     println!("  declaration      : {}", opts.declaration);
//     println!("  source_map       : {}", opts.source_map);
// }

fn main() {
    // let builder = get_compiler_options(None);

    // print_opts("defaults", &builder.default_options());
    // print_opts(
    //     "commonjs",
    //     &builder.build(OutputFormat::Commonjs, None),
    // );
    // print_opts("esm", &builder.build(OutputFormat::Esm, None));
    build(None);
}
