import {createElement as h, useState} from "npm:react";
import {createRoot} from "npm:react-dom/client";
import {MooringDepthAnomaly} from "./MooringDepthAnomaly.js";
import {MooringTimeseriesAtDepth} from "./MooringTimeseriesAtDepth.js";

function nearestDepth(depths, value) {
  return depths.reduce((nearest, depth) =>
    Math.abs(depth - value) < Math.abs(nearest - value) ? depth : nearest
  );
}

function MooringDashboard({moorings}) {
  const [selectedMooringId, setSelectedMooringId] = useState(() => moorings[0].id);
  const selectedMooring = moorings.find(({id}) => id === selectedMooringId) ?? moorings[0];
  const {
    anomalyRows,
    depthAnomalyImageUrl,
    manifest,
    outlineUrl,
    label: selectedMooringLabel
  } = selectedMooring;
  const targetDepths = manifest.target_depths_m;
  const [selectedDepth, setSelectedDepth] = useState(() => nearestDepth(targetDepths, 60));
  const [hoveredYear, setHoveredYear] = useState(null);

  const selectMooring = (event) => {
    const nextMooring = moorings.find(({id}) => id === event.target.value);
    if (!nextMooring) return;
    setSelectedMooringId(nextMooring.id);
    setSelectedDepth((currentDepth) => nearestDepth(nextMooring.manifest.target_depths_m, currentDepth));
  };

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
      selectedMooring: selectedMooringLabel,
      moorings,
      selectedMooringId,
      selectMooring,
      setHoveredYear,
      timeseries: h(MooringTimeseriesAtDepth, {
        embedded: true,
        selectedDepth,
        anomalyRows,
        manifest,
        hoveredYear
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
