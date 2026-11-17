import {createElement as h, useEffect, useRef} from "npm:react";
import * as d3 from "npm:d3";

function calendarDate(date) {
  return new Date(Date.UTC(2000, date.getUTCMonth(), date.getUTCDate()));
}

function climatologyDate(weekOfYear) {
  return new Date(Date.UTC(2000, 0, 1 + (weekOfYear - 0.5) * 7));
}

function temperatureDomain(values) {
  const [minimum, maximum] = d3.extent(values);
  const padding = Math.max(0.25, (maximum - minimum) * 0.08);
  return [minimum - padding, maximum + padding];
}

export function MooringTimeseriesAtDepth({embedded = false, selectedDepth, anomalyRows, manifest, hoveredYear = null}) {
  const mooring = manifest.mooring ?? {};
  const title = `${selectedDepth} m water temperature — ${mooring.name ?? "Mooring"}`;
  const chartContainer = useRef(null);
  const legendContainer = useRef(null);
  const hoveredYearRef = useRef(hoveredYear);
  hoveredYearRef.current = hoveredYear;

  useEffect(() => {
    d3.select(chartContainer.current).selectAll(".mooring-timeseries__linked-year")
      .style("display", ({year}) => year === hoveredYear ? null : "none");
    d3.select(chartContainer.current).selectAll(".mooring-timeseries__linked-label")
      .text(hoveredYear == null ? "" : `Highlighted: ${hoveredYear}`);
  }, [hoveredYear]);

  useEffect(() => {
    const container = chartContainer.current;
    const series = anomalyRows
      .filter((row) => row.depth_m === selectedDepth && Number.isFinite(row.weekly_temperature_c))
      .sort((a, b) => a.time - b.time)
      .map((row) => ({...row, calendarDate: calendarDate(row.time)}));
    const currentYear = d3.max(series, (row) => row.time.getUTCFullYear());
    const seriesByYear = d3.groups(series, (row) => row.time.getUTCFullYear())
      .map(([year, rows]) => ({year, rows}));
    const currentSeries = seriesByYear.find(({year}) => year === currentYear)?.rows ?? [];
    const previousYear = d3.max(seriesByYear.filter(({year}) => year < currentYear), ({year}) => year);
    const previousSeries = seriesByYear.find(({year}) => year === previousYear)?.rows ?? [];
    const firstBaselineYear = d3.min(seriesByYear, ({year}) => year) + 1;
    const historicalRows = series.filter((row) => {
      const year = row.time.getUTCFullYear();
      return year >= firstBaselineYear && year < currentYear;
    });
    const climatology = d3.rollups(
      historicalRows,
      (rows) => d3.mean(rows, (row) => row.weekly_temperature_c),
      (row) => row.week_of_year
    )
      .map(([weekOfYear, weeklyTemperature]) => ({
        calendarDate: climatologyDate(weekOfYear),
        weeklyTemperature
      }))
      .sort((a, b) => a.calendarDate - b.calendarDate);
    // Emphasize only the portion after the current year's latest weekly date.
    const halfWeek = 3.5 * 24 * 60 * 60 * 1000;
    const yearEnd = Date.UTC(2001, 0, 1);
    const latestCurrentDate = d3.max(currentSeries, (row) => +row.calendarDate);
    const emphasizedRanges = latestCurrentDate == null ? [] : [[latestCurrentDate, yearEnd]];

    const legendItems = [
      {label: "Previous Years", className: "mooring-timeseries__historical-line"},
      {label: `Mean ${firstBaselineYear}–${currentYear - 1}`, className: "mooring-timeseries__climatology-line"},
      {label: `${previousYear}`, className: "mooring-timeseries__prior-line"},
      {label: `${currentYear}`, className: "mooring-timeseries__current-line"}
    ];
    const legend = d3.select(legendContainer.current);
    legend.selectAll("*").remove();
    if (series.length) {
      const items = legend.selectAll("li").data(legendItems).join("li");
      items.append("svg")
        .attr("width", 30).attr("height", 12).attr("aria-hidden", "true")
        .append("path")
        .attr("d", "M1,6H29")
        .attr("class", ({className}) => className);
      items.append("span").text(({label}) => label);
    }

    const render = () => {
      const width = Math.max(container.clientWidth, 320);
      const height = Math.max(container.clientHeight, 200);
      const styles = getComputedStyle(container);
      const margin = {
        top: 10,
        right: Number.parseFloat(styles.getPropertyValue("--plot-right")) || 20,
        bottom: 34,
        left: Number.parseFloat(styles.getPropertyValue("--plot-left")) || 50
      };
      const innerWidth = width - margin.left - margin.right;
      const innerHeight = height - margin.top - margin.bottom;
      const svg = d3.select(container).selectAll("svg").data([null]).join("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-label", `${title}; historical years are gray, ${previousYear} is blue with thicker segments after the latest ${currentYear} date, ${currentYear} is purple, and the green line is the mean of prior years.`);

      svg.selectAll("*").remove();
      const plot = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
      const values = series.map((row) => row.weekly_temperature_c);
      if (!series.length || !values.length) {
        plot.append("text").attr("class", "mooring-timeseries__empty")
          .attr("x", innerWidth / 2).attr("y", innerHeight / 2)
          .attr("text-anchor", "middle").text("No weekly temperature data at this depth.");
        return;
      }

      const x = d3.scaleTime()
        .domain([new Date(Date.UTC(2000, 0, 1)), new Date(Date.UTC(2001, 0, 1))])
        .range([0, innerWidth]);
      const y = d3.scaleLinear()
        .domain(temperatureDomain(values))
        .nice()
        .range([innerHeight, 0]);
      const clipId = "mooring-timeseries-plot-clip";
      const definitions = plot.append("defs");
      definitions.append("clipPath")
        .attr("id", clipId)
        .append("rect")
        .attr("width", innerWidth)
        .attr("height", innerHeight);
      const priorClipId = "mooring-timeseries-prior-emphasis-clip";
      definitions.append("clipPath").attr("id", priorClipId)
        .selectAll("rect").data(emphasizedRanges).join("rect")
        .attr("x", ([start]) => x(start))
        .attr("y", 0)
        .attr("width", ([start, end]) => x(end) - x(start))
        .attr("height", innerHeight);

      const line = d3.line()
        .x((row) => x(row.calendarDate))
        .y((row) => y(row.weekly_temperature_c));
      const climatologyLine = d3.line()
        .x((row) => x(row.calendarDate))
        .y((row) => y(row.weeklyTemperature));
      const lines = plot.append("g").attr("clip-path", `url(#${clipId})`);

      lines.selectAll("path.mooring-timeseries__historical-line")
        .data(seriesByYear.filter(({year}) => year !== currentYear && year !== previousYear))
        .join("path")
        .attr("class", "mooring-timeseries__historical-line")
        .attr("d", ({rows}) => line(rows));
      lines.append("path")
        .datum(climatology)
        .attr("class", "mooring-timeseries__climatology-line")
        .attr("d", climatologyLine);
      lines.append("path")
        .datum(previousSeries)
        .attr("class", "mooring-timeseries__prior-line")
        .attr("d", line);
      lines.append("path")
        .datum(previousSeries)
        .attr("class", "mooring-timeseries__prior-line mooring-timeseries__prior-line--emphasized")
        .attr("clip-path", `url(#${priorClipId})`)
        .attr("d", line);
      lines.append("path")
        .datum(currentSeries)
        .attr("class", "mooring-timeseries__current-line")
        .attr("d", line);
      lines.selectAll(".mooring-timeseries__linked-year")
        .data(seriesByYear).join("path")
        .attr("class", "mooring-timeseries__linked-year")
        .attr("d", ({rows}) => line(rows))
        .style("display", ({year}) => year === hoveredYearRef.current ? null : "none");
      plot.append("text")
        .attr("class", "mooring-timeseries__linked-label")
        .attr("x", innerWidth).attr("y", 16).attr("text-anchor", "end")
        .text(hoveredYearRef.current == null ? "" : `Highlighted: ${hoveredYearRef.current}`);

      plot.append("g").attr("class", "mooring-timeseries__axis")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x).ticks(d3.timeMonth.every(width < 600 ? 3 : 1)).tickFormat(d3.timeFormat("%b")));
      plot.append("g").attr("class", "mooring-timeseries__axis")
        .call(d3.axisLeft(y).ticks(5));
      plot.append("text")
        .attr("class", "mooring-timeseries__axis-label")
        .attr("transform", `translate(-38,${innerHeight / 2}) rotate(-90)`)
        .attr("text-anchor", "middle")
        .text("Temperature (°C)");
      const nearestRow = d3.bisector((row) => row.calendarDate).center;
      const formatDate = d3.timeFormat("%b %-d, %Y");
      const hoverGuide = plot.append("line")
        .attr("class", "mooring-timeseries__hover-guide")
        .attr("y1", 0)
        .attr("y2", innerHeight)
        .attr("aria-hidden", "true")
        .style("display", "none");
      const tooltipWidth = 170;
      const tooltipHeight = 58;
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
      const tooltipMean = tooltip.append("text")
        .attr("class", "mooring-timeseries__tooltip-date")
        .attr("x", 8)
        .attr("y", 47);
      const hoverOverlay = plot.append("rect")
        .attr("width", innerWidth)
        .attr("height", innerHeight)
        .attr("fill", "transparent")
        .style("cursor", "crosshair");

      hoverOverlay
        .on("pointermove.temperature", (event) => {
          const [pointerX] = d3.pointer(event, plot.node());
          const hoveredCalendarDate = x.invert(Math.max(0, Math.min(innerWidth, pointerX)));
          const currentRow = currentSeries[nearestRow(currentSeries, hoveredCalendarDate)];
          const hasCurrentValue = currentRow && Math.abs(currentRow.calendarDate - hoveredCalendarDate) <= halfWeek;
          const hoveredRow = hasCurrentValue
            ? currentRow
            : previousSeries[nearestRow(previousSeries, hoveredCalendarDate)];
          if (!hoveredRow || Math.abs(hoveredRow.calendarDate - hoveredCalendarDate) > halfWeek) {
            hoverGuide.style("display", "none");
            tooltip.style("display", "none");
            return;
          }
          const climateValue = d3.mean(
            historicalRows.filter((row) => row.week_of_year === hoveredRow.week_of_year),
            (row) => row.weekly_temperature_c
          );
          const hoveredX = x(hoveredRow.calendarDate);
          hoverGuide.attr("x1", hoveredX).attr("x2", hoveredX).style("display", null);
          tooltip
            .attr("transform", `translate(${Math.max(0, Math.min(innerWidth - tooltipWidth, hoveredX + 10))},${Math.min(innerHeight - tooltipHeight - 4, 28)})`)
            .style("display", null);
          tooltipDate.text(formatDate(hoveredRow.time));
          tooltipValue.text(`${hoveredRow.time.getUTCFullYear()}: ${hoveredRow.weekly_temperature_c.toFixed(2)} °C`);
          tooltipMean.text(`Prior-years mean: ${climateValue?.toFixed(2) ?? "—"} °C`);
        })
        .on("pointerleave.temperature", () => {
          hoverGuide.style("display", "none");
          tooltip.style("display", "none");
        });
    };

    render();
    const observer = new ResizeObserver(render);
    observer.observe(container);
    return () => observer.disconnect();
  }, [anomalyRows, selectedDepth, title]);

  const chart = h(
    "div",
    {className: "mooring-plot__body mooring-plot__body--timeseries", "aria-label": title},
    h("h3", {className: "mooring-timeseries__title"}, title),
    h("ul", {className: "mooring-timeseries__legend", ref: legendContainer, "aria-label": "Temperature series legend"}),
    h("div", {className: "mooring-timeseries__chart", ref: chartContainer})
  );

  if (embedded) return chart;

  return h(
    "section",
    {className: "mooring-plot mooring-timeseries-at-depth", "aria-label": "Mooring temperature at depth"},
    h("div", {className: "mooring-plot__surface"}, chart)
  );
}
