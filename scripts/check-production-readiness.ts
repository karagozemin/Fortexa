import { loadEnvConfig } from "@next/env";

import {
  checkProductionReadiness,
  formatProductionReadinessReport,
} from "../src/lib/readiness/production";

loadEnvConfig(process.cwd());

const report = checkProductionReadiness(process.env);
const output = formatProductionReadinessReport(report);

if (!report.ok) {
  console.error(output);
  process.exitCode = 1;
} else {
  console.log(output);
}
