import {createElement as h} from "npm:react";

export function MooringTimeseriesAtDepth({selectedDepth, selectedMooring}) {
  const title = `${selectedMooring}: Temperature anomaly at ${selectedDepth}m`;

  return h(
    "section",
    {className: "mooring-plot mooring-timeseries-at-depth", "aria-label": "Mooring Timeseries at Depth"},
    h(
      "div",
      {className: "mooring-plot__surface"},
      h(
        "header",
        {className: "mooring-plot__header mooring-plot__header--timeseries"},
        h(
          "div",
          {className: "mooring-plot__heading-group"},
          h("h2", {className: "mooring-plot__title"}, title)
        ),
      ),
      h(
        "div",
        {
          className: "mooring-plot__body mooring-plot__body--timeseries",
          role: "status",
          "aria-label": `${title}; data will be added when the data contract is defined.`
        },
        h(
          "div",
          {className: "mooring-plot__empty-state"},
          h("p", {className: "mooring-plot__empty-title"}, "Time-series data is being prepared"),
          h("p", null, "Choose a depth above to set the series that will appear here.")
        )
      )
    )
  );
}
