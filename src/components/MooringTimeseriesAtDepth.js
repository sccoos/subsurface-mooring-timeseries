import {createElement as h, useEffect, useRef} from "npm:react";
import * as d3 from "npm:d3";

export function MooringTimeseriesAtDepth({embedded = false, selectedDepth, anomalyRows, manifest, selectedTimeRange, setSelectedTimeRange}) {
  const title = `Temperature anomaly at ${selectedDepth}m`;
  const chartContainer = useRef(null);

  useEffect(() => {
    const container = chartContainer.current;
    const series = anomalyRows
      .filter((row) => row.depth_m === selectedDepth)
      .sort((a, b) => a.time - b.time);

    const render = () => {
      const width = Math.max(container.clientWidth, 320);
      const height = Math.max(container.clientHeight, 200);
      const styles = getComputedStyle(container);
      const margin = {
        top: 12,
        right: Number.parseFloat(styles.getPropertyValue("--plot-right")) || 20,
        bottom: 34,
        left: Number.parseFloat(styles.getPropertyValue("--plot-left")) || 50
      };
      const innerWidth = width - margin.left - margin.right;
      const innerHeight = height - margin.top - margin.bottom;
      const svg = d3.select(container).selectAll("svg").data([null]).join("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-label", title);

      svg.selectAll("*").remove();
      const plot = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
      plot.append("text")
        .attr("class", "mooring-timeseries__annotation")
        .attr("x", 6)
        .attr("y", 16)
        .text(title);
      const values = series.map((row) => row.temperature_anomaly_c).filter(Number.isFinite);
      if (!series.length || !values.length) {
        plot.append("text").attr("class", "mooring-timeseries__empty")
          .attr("x", innerWidth / 2).attr("y", innerHeight / 2)
          .attr("text-anchor", "middle").text("No time-series data at this depth.");
        return;
      }

      const fullTimeDomain = d3.extent(series, (row) => row.time);
      const hoverSeries = series.filter((row) => Number.isFinite(row.temperature_anomaly_c));
      const nearestRow = d3.bisector((row) => row.time).center;
      const formatDate = d3.timeFormat("%b %-d, %Y");
      const x = d3.scaleTime()
        .domain(selectedTimeRange ?? fullTimeDomain)
        .range([0, innerWidth]);
      const [minimumAnomaly, , maximumAnomaly] = manifest.colorbar.domain;
      const y = d3.scaleLinear()
        .domain([minimumAnomaly, maximumAnomaly])
        .range([innerHeight, 0]);
      const gradientId = "mooring-timeseries-anomaly-gradient";
      const clipId = "mooring-timeseries-plot-clip";
      const definitions = plot.append("defs");
      definitions.append("clipPath")
        .attr("id", clipId)
        .append("rect")
        .attr("width", innerWidth)
        .attr("height", innerHeight);
      const gradient = definitions.append("linearGradient")
        .attr("id", gradientId)
        .attr("gradientUnits", "userSpaceOnUse")
        .attr("x1", 0)
        .attr("x2", 0)
        .attr("y1", y(minimumAnomaly))
        .attr("y2", y(maximumAnomaly));

      gradient.selectAll("stop").data(manifest.colorbar.stops).join("stop")
        .attr("offset", ({offset}) => {
          const anomaly = offset <= 0.5
            ? minimumAnomaly + (offset / 0.5) * -minimumAnomaly
            : ((offset - 0.5) / 0.5) * maximumAnomaly;
          return `${((anomaly - minimumAnomaly) / (maximumAnomaly - minimumAnomaly)) * 100}%`;
        })
        .attr("stop-color", ({color}) => color);

      plot.append("line").attr("class", "mooring-timeseries__zero-line")
        .attr("x1", 0).attr("x2", innerWidth).attr("y1", y(0)).attr("y2", y(0));
      plot.append("path").datum(series).attr("class", "mooring-timeseries__line")
        .attr("clip-path", `url(#${clipId})`)
        .style("stroke", `url(#${gradientId})`)
        .attr("d", d3.line().defined((row) => Number.isFinite(row.temperature_anomaly_c))
          .x((row) => x(row.time)).y((row) => y(row.temperature_anomaly_c)));
      plot.append("g").attr("class", "mooring-timeseries__axis")
        .attr("transform", `translate(0,${innerHeight})`).call(d3.axisBottom(x).ticks(width < 600 ? 4 : 8));
      plot.append("g").attr("class", "mooring-timeseries__axis")
        .call(d3.axisTop(x).ticks(width < 600 ? 4 : 8));
      plot.append("g").attr("class", "mooring-timeseries__axis")
        .call(d3.axisLeft(y).ticks(5));
      plot.append("text")
        .attr("class", "mooring-timeseries__axis-label")
        .attr("transform", `translate(-38,${innerHeight / 2}) rotate(-90)`)
        .attr("text-anchor", "middle")
        .text("°C");

      const brush = d3.brushX()
        .extent([[0, 0], [innerWidth, innerHeight]])
        .on("end", (event) => {
          if (!event.selection) return;
          const [start, end] = event.selection.map(x.invert);
          if (end - start < 24 * 60 * 60 * 1000) return;
          setSelectedTimeRange([start.getTime(), end.getTime()]);
        });

      plot.append("g")
        .attr("class", "mooring-timeseries__brush")
        .attr("aria-label", "Drag to select a date range; double-click to reset the range")
        .call(brush);

      const hoverGuide = plot.append("line")
        .attr("class", "mooring-timeseries__hover-guide")
        .attr("y1", 0)
        .attr("y2", innerHeight)
        .attr("aria-hidden", "true")
        .style("display", "none");
      const tooltipWidth = 138;
      const tooltipHeight = 42;
      const tooltip = plot.append("g")
        .attr("class", "mooring-timeseries__tooltip")
        .attr("aria-hidden", "true")
        .style("display", "none");
      tooltip.append("rect")
        .attr("width", tooltipWidth)
        .attr("height", tooltipHeight)
        .attr("rx", 4);
      const tooltipDate = tooltip.append("text")
        .attr("class", "mooring-timeseries__tooltip-date")
        .attr("x", 8)
        .attr("y", 15);
      const tooltipValue = tooltip.append("text")
        .attr("class", "mooring-timeseries__tooltip-value")
        .attr("x", 8)
        .attr("y", 31);

      plot
        .on("pointermove.hover-guide", (event) => {
          const [pointerX] = d3.pointer(event, plot.node());
          const hoveredRow = hoverSeries[nearestRow(hoverSeries, x.invert(pointerX))];
          if (!hoveredRow) return;
          const hoveredX = x(hoveredRow.time);
          hoverGuide
            .attr("x1", hoveredX)
            .attr("x2", hoveredX)
            .style("display", null);
          tooltip
            .attr("transform", `translate(${Math.max(0, Math.min(innerWidth - tooltipWidth, hoveredX + 10))},${Math.min(innerHeight - tooltipHeight - 4, 28)})`)
            .style("display", null);
          tooltipDate.text(formatDate(hoveredRow.time));
          tooltipValue.text(`${hoveredRow.temperature_anomaly_c > 0 ? "+" : ""}${hoveredRow.temperature_anomaly_c.toFixed(2)} °C`);
        })
        .on("pointerleave.hover-guide", () => {
          hoverGuide.style("display", "none");
          tooltip.style("display", "none");
        });

      svg.on("dblclick", () => setSelectedTimeRange(null));
    };

    render();
    const observer = new ResizeObserver(render);
    observer.observe(container);
    return () => observer.disconnect();
  }, [anomalyRows, selectedDepth, title, manifest, selectedTimeRange, setSelectedTimeRange]);

  const chart = h(
    "div",
    {
      className: "mooring-plot__body mooring-plot__body--timeseries",
      "aria-label": title
    },
    h("div", {className: "mooring-timeseries__chart", ref: chartContainer})
  );

  if (embedded) return chart;

  return h(
    "section",
    {className: "mooring-plot mooring-timeseries-at-depth", "aria-label": "Mooring Timeseries at Depth"},
    h("div", {className: "mooring-plot__surface"}, chart)
  );
}
