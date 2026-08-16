mod graph;
use graph::dependensia;


fn main(){
    let grp = dependensia("node_src/index.ts", ".").expect("Fail to generate graph");
    let topo = grp.sort();
    let topo_json = serde_json::to_string_pretty(&topo).expect("failed to serialize topological order");
    std::fs::write("topo_2.json", topo_json).expect("failed to write topo_2.json");
}