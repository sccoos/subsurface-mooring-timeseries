```js
import {renderMooringDashboard} from "./components/MooringDashboard.js";
import {DuckDBClient} from "npm:@observablehq/duckdb";

document.title = "Subsurface Mooring Timeseries";

const m1OutlineUrl = await FileAttachment("assets/M1-Mooring-outline.svg").url();
const m1Archive = await FileAttachment("data/m1_weekly_anomaly.zip").zip();
const delMarArchive = await FileAttachment("data/delmar_weekly_anomaly.zip").zip();
const anomalyDatabase = await DuckDBClient.of({
  m1_weekly_anomaly: m1Archive.file("M1_tempanomaly_weekly.parquet"),
  delmar_weekly_anomaly: delMarArchive.file("DelMar_tempanomaly_weekly.parquet")
});
const m1AnomalyTable = await anomalyDatabase.query(`
  SELECT time, depth_m, weekly_temperature_c, week_of_year
  FROM m1_weekly_anomaly
  ORDER BY time, depth_m
`);
const delMarAnomalyTable = await anomalyDatabase.query(`
  SELECT time, depth_m, weekly_temperature_c, week_of_year
  FROM delmar_weekly_anomaly
  ORDER BY time, depth_m
`);
const toAnomalyRows = (table) => table.toArray().map((row) => ({
  time: new Date(row.time),
  depth_m: Number(row.depth_m),
  weekly_temperature_c: row.weekly_temperature_c == null ? null : Number(row.weekly_temperature_c),
  week_of_year: Number(row.week_of_year)
}));
const moorings = [
  {
    id: "m1",
    label: "M1 Mooring",
    outlineUrl: m1OutlineUrl,
    depthAnomalyImageUrl: await m1Archive.file("M1_tempanomaly_weekly.png").url(),
    manifest: await m1Archive.file("M1_tempanomaly_weekly_manifest.json").json(),
    anomalyRows: toAnomalyRows(m1AnomalyTable)
  },
  {
    id: "delmar",
    label: "Del Mar",
    outlineUrl: m1OutlineUrl,
    depthAnomalyImageUrl: await delMarArchive.file("DelMar_tempanomaly_weekly.png").url(),
    manifest: await delMarArchive.file("DelMar_tempanomaly_weekly_manifest.json").json(),
    anomalyRows: toAnomalyRows(delMarAnomalyTable)
  }
];

const page = document.createElement("div");
page.className = "dashboard-page";
page.append(renderMooringDashboard({moorings}));
display(page);
```
