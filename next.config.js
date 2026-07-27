/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // sqlite-vec's load() does a runtime require.resolve() of a
  // platform-specific package name (Search.md) — webpack can't statically
  // bundle that, and silently mangles `require` into something without
  // `.resolve` if it tries. better-sqlite3 doesn't need this listed
  // explicitly since Next already externalizes it by default; sqlite-vec
  // isn't common enough to be on that built-in list.
  serverExternalPackages: ["sqlite-vec"],
  webpack: (config) => {
    // Uploaded files and backup archives live under the project root but
    // aren't source code — without this, every upload/backup write (the
    // daily scheduler in scripts/scheduler-hourly.ts runs one automatically)
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
