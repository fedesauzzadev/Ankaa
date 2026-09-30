import { DEV_LICENSE_KEY } from "../../packages/cli/src/license.js";

process.env.ANKAA_LICENSE_KEY ??= DEV_LICENSE_KEY;
