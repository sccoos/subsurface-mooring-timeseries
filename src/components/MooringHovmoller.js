import {createElement as h, useRef} from "npm:react";

const MOORINGS = ["M1 Mooring", "Del Mar Mooring"];
const DEPTH_MIN = 0;
const DEPTH_MAX = 300;
const DEPTH_STEP = 10;

function setDepthFromPointer(event, railRef, setSelectedDepth) {
  const bounds = railRef.current.getBoundingClientRect();
  const position = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
  const depth = Math.round(((position * (DEPTH_MAX - DEPTH_MIN)) + DEPTH_MIN) / DEPTH_STEP) * DEPTH_STEP;
  setSelectedDepth(depth);
}

export function MooringHovmoller({outlineUrl, placeholderUrl, selectedDepth, setSelectedDepth, selectedMooring, setSelectedMooring}) {
  const railRef = useRef(null);
  const depthPosition = `${(selectedDepth / DEPTH_MAX) * 100}%`;
  const depthMarkers = [];

  for (let depth = DEPTH_MIN; depth <= DEPTH_MAX; depth += DEPTH_STEP) {
    depthMarkers.push(
      h("span", {
        key: depth,
        className: "mooring-plot__depth-marker",
        style: {"--depth-position": `${(depth / DEPTH_MAX) * 100}%`}
      })
    );
  }

  const updateDepthFromKeyboard = (event) => {
    if (event.key === "ArrowUp" || event.key === "ArrowRight") {
      setSelectedDepth(Math.min(DEPTH_MAX, selectedDepth + DEPTH_STEP));
      event.preventDefault();
    }
    if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
      setSelectedDepth(Math.max(DEPTH_MIN, selectedDepth - DEPTH_STEP));
      event.preventDefault();
    }
  };

  return h(
    "section",
    {className: "mooring-plot mooring-hovmoller", "aria-label": "Mooring Hovmoller"},
    h(
      "div",
      {className: "mooring-plot__surface", "aria-label": "Mooring Hovmoller"},
      h(
        "header",
        {className: "mooring-plot__header"},
        h("img", {className: "mooring-plot__outline", src: outlineUrl, alt: "M1 mooring outline"}),
        h(
          "select",
          {
            className: "mooring-plot__select",
            value: selectedMooring,
            "aria-label": "Select mooring",
            onChange: (event) => setSelectedMooring(event.target.value)
          },
          MOORINGS.map((mooring) => h("option", {key: mooring, value: mooring}, mooring))
        ),
        h(
          "div",
          {className: "mooring-plot__colorbar", role: "img", "aria-label": "Temperature anomaly color scale from minus 3 to plus 3 degrees Celsius"},
          h("div", {className: "mooring-plot__colorbar-scale"}),
          h(
            "div",
            {className: "mooring-plot__colorbar-labels"},
            ["-3 °C", "0", "+3 °C"].map((label) => h("span", {key: label}, label))
          )
        )
      ),
      h(
        "div",
        {className: "mooring-plot__body mooring-plot__body--hovmoller"},
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
                "aria-valuemin": DEPTH_MIN,
                "aria-valuemax": DEPTH_MAX,
                "aria-valuenow": selectedDepth,
                onPointerDown: (event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDepthFromPointer(event, railRef, setSelectedDepth);
                  event.preventDefault();
                },
                onPointerMove: (event) => {
                  if (event.buttons) setDepthFromPointer(event, railRef, setSelectedDepth);
                },
                onKeyDown: updateDepthFromKeyboard
              },
              `${selectedDepth} m`
            ),
            h("input", {
              className: "mooring-plot__depth-slider",
              type: "range",
              min: DEPTH_MIN,
              max: DEPTH_MAX,
              step: DEPTH_STEP,
              value: selectedDepth,
              "aria-label": "Depth",
              onChange: (event) => setSelectedDepth(Number(event.target.value))
            })
          )
        ),
        h("img", {className: "mooring-plot__image", src: placeholderUrl, alt: `${selectedMooring} Hovmoller placeholder visualization`})
      )
    )
  );
}
