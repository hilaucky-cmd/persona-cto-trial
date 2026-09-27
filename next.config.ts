import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  logging: {
    incomingRequests: {
      // Its query string carries Google's authorization code.
      ignore: [/\/api\/auth\/google\/callback/],
    },
  },
};

export default nextConfig;
