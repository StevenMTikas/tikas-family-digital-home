/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Uploaded files and backup archives live under the project root but
    // aren't source code — without this, every upload/backup write (the
    // daily scheduler in instrumentation-node.ts runs one automatically)
    // triggers a dev-server Fast Refresh, which can interrupt whatever the
    // user was doing in the browser at that moment.
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ["**/node_modules/**", "**/uploads/**", "**/backups/**"],
    };
    return config;
  },
};

module.exports = nextConfig;
