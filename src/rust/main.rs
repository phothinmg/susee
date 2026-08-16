mod dependencies;
mod graph;
use dependencies::generate_dependencies;


fn main(){
    let tree = generate_dependencies("node_src/index.ts", ".")
        .expect("Fail to generate dependencies tree");
    let tree_json = serde_json::to_string_pretty(&tree).expect("failed to serialize dependencies tree");
    std::fs::write("topo_2.json", tree_json).expect("failed to write topo_2.json");
}