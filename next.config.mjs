/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk", "mermaid"],
  devIndicators: false,
};
export default nextConfig;
