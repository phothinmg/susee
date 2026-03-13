import type SuseeTypes = require("@suseejs/types");
import terser = require("terser");

/**
 * A Susee plugin that minifies JavaScript code using the Terser library.
 *
 * @param {terser.MinifyOptions | undefined} [terserMinifyOptions]
 *   Options for the Terser library. If not specified, the default options
 *   will be used.
 *
 * @returns {SuseeTypes.SuseePlugin} A Susee plugin object.
 */
function suseeTerser(
  terserMinifyOptions?: terser.MinifyOptions | undefined,
): SuseeTypes.SuseePlugin {
  return {
    type: "post-process",
    async: true,
    name: "@suseejs/plugin-terser",
    func: async function (code, _file) {
      const _code = (await terser.minify(code, terserMinifyOptions)).code;
      if (_code) {
        code = _code;
      }
      return code;
    },
  };
}

export = suseeTerser;
