// Tech-stack icons from Simple Icons, the same set getsolari.com loads from
// cdn.simpleicons.org. Bundled so cards render offline and without a CDN hop.
import {
  siAnthropic, siAstro, siBun, siClaude, siCloudflare, siCloudflareworkers, siCss, siDeno,
  siDjango, siDocker, siDotnet, siElectron, siExpress, siFastapi, siFastify, siFfmpeg, siFlask,
  siGit, siGithub, siGnubash, siGo, siGooglechrome, siGooglegemini, siGradio, siGraphql, siHono,
  siHtml5, siHuggingface, siJavascript, siJest, siJupyter, siKotlin, siKubernetes, siLangchain,
  siLinux, siMongodb, siNestjs, siNextdotjs, siNginx, siNodedotjs, siNpm, siNumpy, siOllama,
  siOpenjdk, siPandas, siPhp, siPnpm, siPostgresql, siPrisma, siPuppeteer, siPytest, siPython, siPytorch,
  siReact, siRedis, siRemix, siRuby, siRust, siSelenium, siSocketdotio, siSqlite, siStreamlit,
  siSupabase, siSvelte, siSwift, siTailwindcss, siTensorflow, siTerraform, siTrpc, siTypescript,
  siUbuntu, siVercel, siVite, siVitest, siVuedotjs, siWebassembly, siYarn, siZod,
} from "simple-icons";

export interface IconData {
  title: string;
  slug: string;
  hex: string;
  path: string;
}

const ALL: IconData[] = [
  siAnthropic, siAstro, siBun, siClaude, siCloudflare, siCloudflareworkers, siCss, siDeno,
  siDjango, siDocker, siDotnet, siElectron, siExpress, siFastapi, siFastify, siFfmpeg, siFlask,
  siGit, siGithub, siGnubash, siGo, siGooglechrome, siGooglegemini, siGradio, siGraphql, siHono,
  siHtml5, siHuggingface, siJavascript, siJest, siJupyter, siKotlin, siKubernetes, siLangchain,
  siLinux, siMongodb, siNestjs, siNextdotjs, siNginx, siNodedotjs, siNpm, siNumpy, siOllama,
  siOpenjdk, siPandas, siPhp, siPnpm, siPostgresql, siPrisma, siPuppeteer, siPytest, siPython, siPytorch,
  siReact, siRedis, siRemix, siRuby, siRust, siSelenium, siSocketdotio, siSqlite, siStreamlit,
  siSupabase, siSvelte, siSwift, siTailwindcss, siTensorflow, siTerraform, siTrpc, siTypescript,
  siUbuntu, siVercel, siVite, siVitest, siVuedotjs, siWebassembly, siYarn, siZod,
];

const BY_SLUG = new Map(ALL.map((i) => [i.slug, i]));

// Names the triage step tends to produce that are not Simple Icons slugs.
const ALIASES: Record<string, string> = {
  node: "nodedotjs", nodejs: "nodedotjs", "node.js": "nodedotjs", ts: "typescript",
  js: "javascript", next: "nextdotjs", nextjs: "nextdotjs", chrome: "googlechrome",
  chromium: "googlechrome", playwright: "googlechrome", bash: "gnubash", shell: "gnubash",
  vue: "vuedotjs", postgres: "postgresql", java: "openjdk", gemini: "googlegemini",
  html: "html5", css3: "css", tailwind: "tailwindcss", "socket.io": "socketdotio",
  golang: "go", workers: "cloudflareworkers", torch: "pytorch", hf: "huggingface",
};

export function resolveIcon(slug: string): IconData | null {
  const key = slug.toLowerCase().trim();
  return BY_SLUG.get(key) ?? BY_SLUG.get(ALIASES[key] ?? "") ?? null;
}

export const ICON_SLUGS = ALL.map((i) => i.slug);
