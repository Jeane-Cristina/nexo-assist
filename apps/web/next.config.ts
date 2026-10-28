import type { NextConfig } from "next";

const config: NextConfig = {
  // libSQL e Mastra rodam só no servidor, com módulos nativos: não devem ser empacotados.
  serverExternalPackages: ["@libsql/client", "@mastra/core"],
};

export default config;
