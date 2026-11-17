import {createElement as h, useRef} from "npm:react";
import {MooringAnomalyTimeline} from "./MooringAnomalyTimeline.js";

function nearestDepth(depths, depth) {
  return depths.reduce((nearest, candidate) =>
    Math.abs(candidate - depth) < Math.abs(nearest - depth) ? candidate : nearest
  );
}

function setDepthFromPointer(event, railRef, targetDepths, setSelectedDepth) {
  const bounds = railRef.current.getBoundingClientRect();
  const position = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
  const minimumDepth = targetDepths[0];
  const maximumDepth = targetDepths[targetDepths.length - 1];
  const depth = minimumDepth + position * (maximumDepth - minimumDepth);
  setSelectedDepth(nearestDepth(targetDepths, depth));
}

export function MooringDepthAnomaly({outlineUrl, depthAnomalyImageUrl, targetDepths, colorbar, startDate, endDate, selectedDepth, setSelectedDepth, selectedMooring, moorings, selectedMooringId, selectMooring, setHoveredYear, timeseries}) {
  const railRef = useRef(null);
  const minimumDepth = targetDepths[0];
  const maximumDepth = targetDepths[targetDepths.length - 1];
  const depthPosition = `${((selectedDepth - minimumDepth) / (maximumDepth - minimumDepth)) * 100}%`;
  const selectedDepthIndex = targetDepths.indexOf(selectedDepth);
  const [minimumAnomaly, , maximumAnomaly] = colorbar.domain;
  const colorbarLabels = [`${minimumAnomaly.toFixed(1)} °C`, "0", `${maximumAnomaly.toFixed(1)} °C`];
  const colorbarGradient = `linear-gradient(to right, ${colorbar.stops
    .map(({offset, color}) => `${color} ${offset * 100}%`)
    .join(", ")})`;
  const depthMarkers = targetDepths.map((depth) =>
    h("span", {
      key: depth,
      className: "mooring-plot__depth-marker",
      style: {"--depth-position": `${((depth - minimumDepth) / (maximumDepth - minimumDepth)) * 100}%`}
    })
  );

  const updateDepthFromKeyboard = (event) => {
    if (event.key === "ArrowUp" || event.key === "ArrowRight") {
      setSelectedDepth(targetDepths[Math.min(targetDepths.length - 1, selectedDepthIndex + 1)]);
      event.preventDefault();
    }
    if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
      setSelectedDepth(targetDepths[Math.max(0, selectedDepthIndex - 1)]);
      event.preventDefault();
    }
  };

  return h(
    "section",
    {className: "mooring-plot mooring-depth-anomaly", "aria-label": "Mooring depth anomaly"},
    h(
      "div",
      {className: "mooring-plot__surface", "aria-label": "Mooring depth anomaly"},
      h(
        "header",
        {className: "mooring-plot__header"},
        h("img", {className: "mooring-plot__outline", src: outlineUrl, alt: `${selectedMooring} outline`}),
        h(
          "div",
          {className: "mooring-plot__select-group"},
          h("label", {className: "mooring-plot__select-label", htmlFor: "mooring-select"}, "Mooring"),
          h(
            "select",
            {
              id: "mooring-select",
              className: "mooring-plot__select",
              value: selectedMooringId,
              onChange: selectMooring
            },
            moorings.map(({id, label}) => h("option", {key: id, value: id}, label))
          )
        ),
        h(
          "div",
          {
            className: "mooring-plot__colorbar",
            role: "img",
            "aria-label": `Temperature anomaly color scale from ${minimumAnomaly.toFixed(1)} to ${maximumAnomaly.toFixed(1)} degrees Celsius`
          },
          h("div", {className: "mooring-plot__colorbar-scale", style: {background: colorbarGradient}}),
          h(
            "div",
            {className: "mooring-plot__colorbar-labels"},
            colorbarLabels.map((label) => h("span", {key: label}, label))
          )
        )
      ),
      h(
        "div",
        {
          className: "mooring-plot__body mooring-plot__body--depth-anomaly",
          style: {"--depth-position": depthPosition}
        },
        h(
          "div",
          {className: "mooring-plot__depth-control", style: {"--depth-position": depthPosition}},
          h(
            "div",
            {className: "mooring-plot__depth-rail", ref: railRef},
            h("div", {className: "mooring-plot__depth-markers"}, depthMarkers),
            h("span", {className: "mooring-plot__depth-caret", "aria-hidden": "true"}),
            h(
              "span",
              {
                className: "mooring-plot__depth-value",
                role: "slider",
                tabIndex: 0,
                "aria-label": "Depth",
                "aria-valuemin": minimumDepth,
                "aria-valuemax": maximumDepth,
                "aria-valuenow": selectedDepth,
                onPointerDown: (event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDepthFromPointer(event, railRef, targetDepths, setSelectedDepth);
                  event.preventDefault();
                },
                onPointerMove: (event) => {
                  if (event.buttons) setDepthFromPointer(event, railRef, targetDepths, setSelectedDepth);
                },
                onKeyDown: updateDepthFromKeyboard
              },
              `${selectedDepth} m`
            ),
            h("input", {
              className: "mooring-plot__depth-slider",
              type: "range",
              min: 0,
              max: targetDepths.length - 1,
              step: 1,
              value: selectedDepthIndex,
              "aria-label": "Depth",
              onChange: (event) => setSelectedDepth(targetDepths[Number(event.target.value)]),
              onPointerDown: (event) => {
                event.currentTarget.focus();
                event.currentTarget.setPointerCapture(event.pointerId);
                setDepthFromPointer(event, railRef, targetDepths, setSelectedDepth);
                event.preventDefault();
              },
              onPointerMove: (event) => {
                if (event.buttons) setDepthFromPointer(event, railRef, targetDepths, setSelectedDepth);
              }
            })
          )
        ),
        h("span", {className: "mooring-plot__depth-guide", "aria-hidden": "true"}),
        h(MooringAnomalyTimeline, {
          imageUrl: depthAnomalyImageUrl, startDate, endDate,
          label: `${selectedMooring} depth anomaly`, setHoveredYear
        })
      ),
      timeseries
    )
  );
}
