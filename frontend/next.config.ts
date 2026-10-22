import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static HTML/JS in out/, served by the FastAPI backend.
  output: "export",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
