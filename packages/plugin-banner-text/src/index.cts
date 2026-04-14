import type SuseeTypes = require("@suseejs/types");

/**
 * Susee plugin for banner text.
 *
 * @param {string} bannerText - The banner text to be added to the top of the generated CSS.
 * @returns {SuseeTypes.SuseePlugin} - The Susee plugin.
 */
function suseeBannerText(bannerText: string): SuseeTypes.SuseePlugin {
  return {
    type: "post-process",
    async: false,
    name: "@suseejs/plugin-banner-text",
    func: (code, _file) => {
      return `${bannerText}\n\n${code}`;
    },
  };
}

export = suseeBannerText;
