import {createElement as h, useEffect, useRef} from "npm:react";
import * as d3 from "npm:d3";

export function MooringAnomalyTimeline({imageUrl, startDate, endDate, label, setHoveredYear}) {
  const containerRef = useRef(null);
  useEffect(() => {
    const container = containerRef.current;
    const render = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      const x = d3.scaleUtc()
        .domain([new Date(startDate), new Date(endDate)])
        .range([0, width]);
      const svg = d3.select(container).selectAll("svg").data([null]).join("svg")
        .attr("width", width).attr("height", height)
        .attr("role", "img")
        .attr("aria-label", `${label}, ${startDate} through ${endDate}. Hover to highlight a year below.`);
      svg.selectAll("*").remove();
      svg.append("image").attr("href", imageUrl)
        .attr("width", width).attr("height", height).attr("preserveAspectRatio", "none");
      const ticks = x.ticks(Math.max(2, Math.floor(width / 100)))
        .filter((date) => x(date) > 75 && x(date) < width - 75);
      svg.append("g").attr("class", "mooring-timeseries__axis")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).tickValues(ticks).tickFormat(d3.utcFormat("%Y")));
      const endpoints = svg.append("g").attr("class", "mooring-timeseries__axis");
      x.domain().forEach((date, index) => {
        endpoints.append("text").attr("x", x(date)).attr("y", height + 20)
          .attr("fill", "currentColor").attr("text-anchor", index ? "end" : "start")
          .text(d3.utcFormat("%b %Y")(date));
      });
      const guide = svg.append("g").attr("class", "mooring-anomaly__hover-guide")
        .style("display", "none");
      guide.append("line").attr("class", "mooring-anomaly__guide-outline")
        .attr("y1", 0).attr("y2", height);
      guide.append("line").attr("class", "mooring-anomaly__guide-line")
        .attr("y1", 0).attr("y2", height);
      const labelGroup = svg.append("g").style("display", "none")
        .style("pointer-events", "none");
      const labelBackground = labelGroup.append("rect")
        .attr("fill", "white").attr("rx", 3);
      const dateLabel = labelGroup.append("text").attr("class", "mooring-anomaly__hover-date")
        .attr("y", 18);
      svg.append("rect").attr("width", width).attr("height", height)
        .attr("fill", "transparent").style("cursor", "crosshair")
        .on("pointermove", (event) => {
          const position = Math.max(0, Math.min(width, d3.pointer(event, svg.node())[0]));
          const date = x.invert(position);
          guide.attr("transform", `translate(${position},0)`).style("display", null);
          labelGroup.style("display", null);
          dateLabel.attr("x", position > width / 2 ? position - 8 : position + 8)
            .attr("text-anchor", position > width / 2 ? "end" : "start")
            .text(d3.utcFormat("%b %d, %Y")(date));
          const bounds = dateLabel.node().getBBox();
          labelBackground.attr("x", bounds.x - 5).attr("y", bounds.y - 3)
            .attr("width", bounds.width + 10).attr("height", bounds.height + 6);
          setHoveredYear(date.getUTCFullYear());
        })
        .on("pointerleave", () => {
          guide.style("display", "none");
          labelGroup.style("display", "none");
          setHoveredYear(null);
        });
    };
    render();
    const observer = new ResizeObserver(render);
    observer.observe(container);
    return () => { observer.disconnect(); setHoveredYear(null); };
  }, [imageUrl, startDate, endDate, label, setHoveredYear]);
  return h("div", {className: "mooring-plot__image-window", ref: containerRef});
}
