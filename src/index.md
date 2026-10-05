```js
import {renderMooringDashboard} from "./components/MooringDashboard.js";
import {DuckDBClient} from "npm:@observablehq/duckdb";

document.title = "Subsurface Mooring Timeseries";

const mooringOutlineUrl = await FileAttachment("assets/M1-Mooring-outline.svg").url();
const mooringArchive = await FileAttachment("data/m1_weekly_anomaly.zip").zip();
const depthAnomalyImageUrl = await mooringArchive.file("M1_tempanomaly_weekly.png").url();
const mooringManifest = await mooringArchive.file("M1_tempanomaly_weekly_manifest.json").json();
const anomalyDatabase = await DuckDBClient.of({
  m1_weekly_anomaly: mooringArchive.file("M1_tempanomaly_weekly.parquet")
});
const anomalyTable = await anomalyDatabase.query(`
  SELECT time, depth_m, temperature_anomaly_c
  FROM m1_weekly_anomaly
  ORDER BY time, depth_m
`);
const anomalyRows = anomalyTable.toArray().map((row) => ({
  time: new Date(row.time),
  depth_m: Number(row.depth_m),
  temperature_anomaly_c: row.temperature_anomaly_c == null ? null : Number(row.temperature_anomaly_c)
}));

const page = document.createElement("div");
page.className = "dashboard-page";
page.append(renderMooringDashboard({
  outlineUrl: mooringOutlineUrl,
  depthAnomalyImageUrl,
  manifest: mooringManifest,
  anomalyRows
}));
display(page);
```
