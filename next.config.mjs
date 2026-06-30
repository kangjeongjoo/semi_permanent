// GitHub Pages(정적 호스팅)용 설정.
// GITHUB_PAGES=true 로 빌드할 때만 정적 export + 저장소 경로(basePath)를 적용한다.
// 로컬 개발(npm run dev)은 평소처럼 http://localhost:3000 에서 동작.
const isPages = process.env.GITHUB_PAGES === "true";
const repo = "semi_permanent";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(isPages
    ? {
        output: "export",
        basePath: `/${repo}`,
        assetPrefix: `/${repo}/`,
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
