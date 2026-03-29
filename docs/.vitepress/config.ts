import { defineConfig } from "vitepress";
import { createRequire } from "module";
import { type DefaultTheme } from "vitepress";

import {
  groupIconVitePlugin,
  localIconLoader,
  groupIconMdPlugin,
} from "vitepress-plugin-group-icons";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json");

const siteUrl = "https://suseejs.vercel.app/";

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
  lastUpdated: true,
  cleanUrls: true,
  metaChunk: true,
  markdown: {
    config(md) {
      md.use(groupIconMdPlugin as any); // Markdown-it plugin
    },
  },
  vite: {
    plugins: [groupIconVitePlugin()], // Vite plugin
  },
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
    logo: { src: "/susee.webp", width: 24, height: 24 },
    search: {
      provider: "local",
    },
    editLink: {
      pattern: "https://github.com/phothinmg/susee/edit/main/docs/:path",
      text: "Edit this page on GitHub",
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
          link: "https://github.com/phothinmg/susee/blob/main/CONTRIBUTING.md",
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
        { text: "Core Concepts", link: "core-concepts" },
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
