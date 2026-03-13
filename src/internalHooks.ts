import type {
	ASTPlugin,
	DependencyPlugin,
	PostProcessPlugin,
	PreProcessPlugin,
} from "@suseejs/types";

export const depHooks: DependencyPlugin[] = [];

export const preProcessHooks: PreProcessPlugin[] = [];

export const postProcessHooks: PostProcessPlugin[] = [];

export const astHooks: ASTPlugin[] = [];
