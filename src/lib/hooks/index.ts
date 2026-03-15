import type {
	DependencyPlugin,
	PostProcessPlugin,
	PreProcessPlugin,
} from "@suseejs/types";
import type { DepsHooks } from "./calledFunc.js";

import suseeInternalCleanUnusedCode from "./cleanUnusedInternal.js";
import { suseeInternalRenameDuplicate } from "./duplicateNames/index.js";

// ----------------------------------------------

const depHooks: DepsHooks[] = [suseeInternalRenameDuplicate()];

const preProcessHooks: PreProcessPlugin[] = [suseeInternalCleanUnusedCode()];

const postProcessHooks: PostProcessPlugin[] = [];

const internalHooks = {
	dep: () => depHooks,
	pre: () => preProcessHooks,
	post: () => postProcessHooks,
};

export default internalHooks;
