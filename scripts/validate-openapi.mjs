#!/usr/bin/env node

import { access, constants } from "node:fs/promises";
import path from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";

const rootDir = process.cwd();
const specPath = path.join(rootDir, "docs/api-spec.yaml");

async function main() {
  try {
    await access(specPath, constants.F_OK);

    const api = await SwaggerParser.validate(specPath);
    const title = api?.info?.title || "OpenAPI document";
    const version = api?.info?.version ? ` ${api.info.version}` : "";

    console.log(`OpenAPI spec validated: ${title}${version}`);
  } catch (error) {
    console.error("OpenAPI validation failed:");
    console.error(error.message);
    process.exit(1);
  }
}

main();