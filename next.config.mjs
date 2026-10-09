/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk"],
  devIndicators: false,
};
export default nextConfig;
