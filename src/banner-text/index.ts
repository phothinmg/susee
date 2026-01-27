import path from "node:path";
import { type OutPutHook } from "../types";

const bannerText = (str: string): OutPutHook => {
  return {
    async: false,
    func: (code, file) => {
      if (path.extname(file as string) === ".js") {
        code = `${str}\n${code}`;
      }
      return code;
    },
  };
};

export default bannerText;
