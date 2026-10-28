import { test } from "node:test";
import assert from "node:assert/strict";
import { noRealSite } from "./sitecheck-client.ts";

test("geen echte website alleen bij techniek, foutcode of lege pagina", () => {
  for (const soort of ["techniek", "geen pagina", "leeg"]) assert.equal(noRealSite({ soort }), true, soort);
  for (const soort of ["website", "doorsturen", "onbereikbaar", "overgeslagen", "afgeschermd"]) assert.equal(noRealSite({ soort }), false, soort);
  assert.equal(noRealSite(null), false);
});
