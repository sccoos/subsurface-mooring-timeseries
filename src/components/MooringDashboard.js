import {createElement as h, useState} from "npm:react";
import {createRoot} from "npm:react-dom/client";
import {MooringDepthAnomaly} from "./MooringDepthAnomaly.js";
import {MooringTimeseriesAtDepth} from "./MooringTimeseriesAtDepth.js";

function nearestDepth(depths, value) {
  return depths.reduce((nearest, depth) =>
    Math.abs(depth - value) < Math.abs(nearest - value) ? depth : nearest
  );
}

function MooringDashboard({outlineUrl, depthAnomalyImageUrl, manifest, anomalyRows}) {
  const targetDepths = manifest.target_depths_m;
  const [selectedDepth, setSelectedDepth] = useState(() => nearestDepth(targetDepths, 30));
  const selectedMooring = "M1 Mooring";
  const [selectedTimeRange, setSelectedTimeRange] = useState(null);

  return h(
    "main",
    {className: "mooring-plot-stack"},
    h(MooringDepthAnomaly, {
      outlineUrl,
      depthAnomalyImageUrl,
      targetDepths,
      colorbar: manifest.colorbar,
      startDate: manifest.start_date,
      endDate: manifest.end_date,
      selectedDepth,
      setSelectedDepth,
      selectedMooring,
      selectedTimeRange,
      timeseries: h(MooringTimeseriesAtDepth, {
        embedded: true,
        selectedDepth,
        anomalyRows,
        manifest,
        selectedTimeRange,
        setSelectedTimeRange
      })
    })
  );
}

export function renderMooringDashboard(props) {
  const container = document.createElement("div");
  const root = createRoot(container);
  root.render(h(MooringDashboard, props));
  return container;
}
