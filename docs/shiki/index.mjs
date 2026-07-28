import { createHighlighter } from "shiki";

async function shikiHL(code, lang) {
  /** @type {import("shiki").BundledLanguage} */
  const defaultLangs = [
    "js",
    "ts",
    "sh",
    "json",
    "html",
    "css",
    "ruby",
    "md",
    "yaml",
    "yml",
    "bash",
  ];
  const highlighter = await createHighlighter({
    langs: [...defaultLangs, "text"],
    themes: ["dark-plus", "light-plus"],
  });
  lang = defaultLangs.includes(lang) ? lang : "text";
  return highlighter.codeToHtml(code, {
    lang: lang,
    themes: {
      light: "light-plus",
      dark: "dark-plus",
    },
  });
}
async function readStdin() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  return chunks.join("");
}
if (import.meta.url === new URL(process.argv[1], "file:").href) {
  try {
    const args = await readStdin();
    const { code: c, lang: t } = JSON.parse(args);
    const highlighted = await shikiHL(c, t);
    process.stdout.write(highlighted);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}
