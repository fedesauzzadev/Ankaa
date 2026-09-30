import { DEV_LICENSE_KEY } from "../src/license.js";

process.env.ANKAA_LICENSE_KEY ??= DEV_LICENSE_KEY;
