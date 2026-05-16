#!/usr/bin/env node
import { main } from "./lib/errors.mjs";
import { loadConfig } from "./lib/config.mjs";

main(async () => {
  const config = loadConfig();
  return {
    connections: config.connections.map(({ name, dialect }) => ({ name, dialect }))
  };
});
