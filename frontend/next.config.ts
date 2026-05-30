import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 明确告诉 Turbopack 只监听 src 目录，避免监听 .next 和 node_modules
  // 这可以防止 Turbopack 因检测到自身输出变化而陷入 HMR 循环
};

export default nextConfig;
