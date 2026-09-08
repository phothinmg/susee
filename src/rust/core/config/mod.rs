pub mod out_format;
pub mod entry_point;
pub mod read_config;


pub use entry_point::SuSeeConfig;

use crate::core::log;

pub fn final_build_options(config:Option<SuSeeConfig>) -> std::option::Option<entry_point::BuildOptions>{
  let config_path = entry_point::get_susee_config_path();
  if config.is_none() && config_path.is_none() {
      let info = "Required build options or susee config file at root.You can use `npx susee init` to create susee config file at root".to_string();
      let cause = "No build options or susee config file at root.".to_string();
      log::error(&info, &cause,true);
  }
  let mut build_options:Option<entry_point::BuildOptions> = None;
  if !config.is_none() {
      let susee_config = entry_point::generate_build_options(&config.unwrap());
      build_options = Some(susee_config.unwrap());
  } else if !config_path.is_none() {
      let config_path_2 = config_path.unwrap();
      let cf = config_path_2.to_str().expect("Error");
      let susee_config_from_file = read_config::read_config_file(cf);
      let susee_config = entry_point::generate_build_options(&susee_config_from_file.unwrap());
      build_options = Some(susee_config.unwrap());
  }
  build_options
}