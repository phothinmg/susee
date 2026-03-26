import { defineConfig } from "vitepress";
import { createRequire } from "module";
import { type DefaultTheme } from "vitepress";
import {
  groupIconMdPlugin,
  groupIconVitePlugin,
  localIconLoader,
} from "vitepress-plugin-group-icons";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json");

const siteUrl = "";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Susee",
  description: "Simple TypeScript bundler",
  sitemap: {
    hostname: siteUrl,
    transformItems(items) {
      return items.filter((item) => !item.url.includes("migration"));
    },
  },
  head: [["link", { rel: "icon", href: "/susee.ico" }]],
  // markdown: {
  //   math: true,
  // },
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: nav(),

    sidebar: {
      "/documentation/": { base: "/documentation/", items: sidebarGuide() },
      //'/reference/': { base: '/reference/', items: sidebarReference() }
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/phothinmg/susee" },
    ],
    search: {
      provider: "local",
    },
  },
});

function nav(): DefaultTheme.NavItem[] {
  return [
    {
      text: "Documentation",
      link: "/documentation/what-is-susee",
      activeMatch: "/documentation/",
    },
    {
      text: pkg.version,
      items: [
        {
          text: "Changelog",
          link: "https://github.com/vuejs/vitepress/blob/main/CHANGELOG.md",
        },
        {
          text: "Contributing",
          link: "https://github.com/vuejs/vitepress/blob/main/.github/contributing.md",
        },
      ],
    },
  ];
}

function sidebarGuide(): DefaultTheme.SidebarItem[] {
  return [
    {
      text: "Introduction",
      collapsed: false,
      items: [
        { text: "What is Susee?", link: "what-is-susee" },
        { text: "Getting Started", link: "getting-started" },
      ],
    },
    {
      text: "Configuration",
      collapsed: false,
      items: [],
    },
  ];
}
