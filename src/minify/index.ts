import path from "node:path";
import { minify as minify2, type MinifyOptions } from "terser";
import { type OutPutHook } from "../types";

const minify = (options?: MinifyOptions): OutPutHook => {
  return {
    async: true,
    func: async (code, file) => {
      if (path.extname(file as string) === ".js") {
        code = (await minify2(code, options)).code as string;
      }
      return code;
    },
  };
};

export default minify;
