#!/usr/bin/env node
import { run } from "../dist/apigovscan.mjs";

process.exitCode = await run(process.argv);
