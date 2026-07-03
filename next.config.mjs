import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isGitHubPages = process.env.GITHUB_ACTIONS === "true";
const repoName = "ScafLeague";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  typedRoutes: true,
  outputFileTracingRoot: __dirname,
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  ...(isGitHubPages
    ? {
        basePath: `/${repoName}`,
        assetPrefix: `/${repoName}/`
      }
    : {})
};

export default nextConfig;
