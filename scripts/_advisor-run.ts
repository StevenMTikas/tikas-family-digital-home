import { loadEnv } from "./load-env";
loadEnv();

import("../lib/core/ai/advisor").then(async ({ runAdvisorDetectors }) => {
  const created = await runAdvisorDetectors("weekly_check");
  console.log("suggestions created:", created);
});
