import {createElement as h, useState} from "npm:react";
import {createRoot} from "npm:react-dom/client";
import {MooringHovmoller} from "./MooringHovmoller.js";
import {MooringTimeseriesAtDepth} from "./MooringTimeseriesAtDepth.js";

function MooringDashboard({outlineUrl, placeholderUrl}) {
  const [selectedDepth, setSelectedDepth] = useState(0);
  const [selectedMooring, setSelectedMooring] = useState("M1 Mooring");

  return h(
    "main",
    {className: "mooring-plot-stack"},
    h(MooringHovmoller, {
      outlineUrl,
      placeholderUrl,
      selectedDepth,
      setSelectedDepth,
      selectedMooring,
      setSelectedMooring
    }),
    h(MooringTimeseriesAtDepth, {selectedDepth, selectedMooring})
  );
}

export function renderMooringDashboard(props) {
  const container = document.createElement("div");
  const root = createRoot(container);
  root.render(h(MooringDashboard, props));
  return container;
}
