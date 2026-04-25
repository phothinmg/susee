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
				{ text: "Configuration File Structure", link: "config-file-structure" },
				{ text: "Entry Points", link: "entry-points" },
				{
					text: "tsconfig & Custom Path Integration",
					link: "tsconfig-and-custom-path-integration",
				},
			],
		},
		{
			text: "Plugin System",
			collapsed: false,
			items: [
				{ text: "Plugin Types and Lifecycle", link: "plugin-types-lifecycle" },
				{ text: "How to Write Plugins", link: "how-to-write-plugins" },
			],
		},
		{
			text: "Ecosystem",
			collapsed: false,
			items: [
				{ text: "Ecosystem Overview", link: "ecosystem-overview" },
				{ text: "Core Build Packages", link: "ecosystem-core-build-packages" },
				{ text: "Plugin Packages", link: "ecosystem-plugin-packages" },
				{ text: "Foundation Packages", link: "ecosystem-foundation-packages" },
			],
		},
		{
			text: "Contribution",
			collapsed: false,
			items: [
				{ text: "Contribution Overview", link: "contribution-overview" },
				{ text: "Contributing to Susee", link: "contribution-susee" },
				{
					text: "Contributing to Core Build Packages",
					link: "contribution-core-build-packages",
				},
				{ text: "Pull Request Checklist", link: "contribution-pr-checklist" },
			],
		},
	];
}
