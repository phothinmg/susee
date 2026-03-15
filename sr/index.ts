import foo from "./foo.js";
import bar from "./bar.js";
import type {AA} from "./foo.js"

const due = "Hey I'am the first one!!";

export const gg = {
  aa: foo,
  bb: due,
  cc: bar(3),
};
