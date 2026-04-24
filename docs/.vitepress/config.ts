import { createRequire } from "module";
import { defineConfig, type DefaultTheme } from "vitepress";
import {
	groupIconMdPlugin,
	groupIconVitePlugin,
} from "vitepress-plugin-group-icons";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json");

// https://vitepress.dev/reference/site-config
export default defineConfig({
	title: "Susee",
	description: "Documentation for Susee",
	head: [["link", { rel: "icon", href: "/favicon.ico" }]],
	themeConfig: {
		nav: nav(),

		sidebar: {
			"/guide/": { base: "/guide/", items: sidebarGuide() },
		},

		socialLinks: [
			{ icon: "github", link: "https://github.com/phothinmg/susee" },
		],
		search: {
			provider: "local",
		},
	},
	markdown: {
		config(md) {
			md.use(groupIconMdPlugin);
		},
	},
	vite: {
		plugins: [groupIconVitePlugin()],
	},
});

function nav(): DefaultTheme.NavItem[] {
	return [
		{
			text: "Guide",
			link: "/guide/what-is-susee",
			activeMatch: "/guide/",
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
				{ text: "Key Features", link: "key-features" },
				{
					text: "Quick Start",
					link: "quick-start",
				},
			],
		},
		{
			text: "Configuration",
			collapsed: false,
			items: [
				{ text: "What is Susee?", link: "what-is-susee" },
				{ text: "Key Features", link: "key-features" },
				{
					text: "Quick Start",
					link: "quick-start",
				},
			],
		},
	];
}
