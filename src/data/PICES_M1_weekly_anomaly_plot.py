#!/usr/bin/env python
"""Create the M1 weekly subsurface-temperature anomaly plot.

This standalone generator intentionally omits marine-heatwave detection and
other exploratory figures.

The M1 NetCDF source is downloaded from CENCOOS for each run. Override its URL
or the PNG output location when needed, for example:

    python PICES_M1_weekly_anomaly_plot.py \
        --data-url https://cencoos.org/images/PICES/m1_temp_sal_fulltimeseries.nc \
        --output-path ./M1_tempanomaly_weekly.png
"""

from __future__ import annotations

import argparse
import json
import shutil
import tempfile
from pathlib import Path
from urllib.request import Request, urlopen

import matplotlib
matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.colors as mcolors
import numpy as np
import pandas as pd
import xarray as xr

from matplotlib import pyplot as plt


DATA_DIRECTORY = Path(__file__).resolve().parent
DEFAULT_DATA_URL = "https://cencoos.org/images/PICES/m1_temp_sal_fulltimeseries.nc"
DEFAULT_OUTPUT_PATH = DATA_DIRECTORY / "M1_tempanomaly_weekly.png"
DEFAULT_MANIFEST_PATH = DATA_DIRECTORY / "M1_tempanomaly_weekly_manifest.json"
DEFAULT_PARQUET_PATH = DATA_DIRECTORY / "M1_tempanomaly_weekly.parquet"
TARGET_DEPTHS = [1.0, 10.0, 20.0, 40.0, 60.0, 80.0, 100.0, 150.0, 200.0, 250.0, 300.0]


def standardize_coords(data_array: xr.DataArray) -> xr.DataArray:
    """Use lowercase coordinate names in the consolidated source data."""
    coord_map = {
        "TIME": "time",
        "DEPTH": "depth",
        "LATITUDE": "latitude",
        "LONGITUDE": "longitude",
    }
    rename = {
        old: new
        for old, new in coord_map.items()
        if old in data_array.coords or old in data_array.dims
    }
    return data_array.rename(rename)


def standardize_time_coord(data_array: xr.DataArray) -> xr.DataArray:
    """Convert mixed CFTime/numpy time coordinates to pandas datetimes."""
    times = data_array["time"].values
    if times.dtype != object:
        return data_array

    normalized = []
    for timestamp in times:
        if isinstance(timestamp, np.datetime64):
            normalized.append(pd.Timestamp(timestamp))
        elif hasattr(timestamp, "strftime"):
            normalized.append(pd.Timestamp(timestamp.strftime("%Y-%m-%d %H:%M:%S")))
        else:
            normalized.append(pd.Timestamp(timestamp))
    return data_array.assign_coords(time=pd.DatetimeIndex(normalized))


def select_depth_timeseries(data_array: xr.DataArray, target_depth: float) -> xr.DataArray:
    """Return the nearest depth as a one-dimensional time series."""
    selected = data_array.sel(depth=target_depth, method="nearest").squeeze()
    extra_dims = [dimension for dimension in selected.dims if dimension != "time"]
    if extra_dims:
        selected = selected.isel({dimension: 0 for dimension in extra_dims})
    return selected


def download_temperature_data(data_url: str, destination: Path) -> Path:
    """Download the source NetCDF to a temporary local path."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial_destination = destination.with_suffix(f"{destination.suffix}.part")
    request = Request(data_url, headers={"User-Agent": "M1-weekly-anomaly-loader/1.0"})

    try:
        with urlopen(request, timeout=300) as response, partial_destination.open("wb") as output_file:
            shutil.copyfileobj(response, output_file)
        partial_destination.replace(destination)
    finally:
        partial_destination.unlink(missing_ok=True)

    return destination


def load_temperature(data_path: Path) -> xr.DataArray:
    """Load the temperature variable from a downloaded NetCDF source file."""
    if not data_path.is_file():
        raise FileNotFoundError(f"Temperature dataset not found: {data_path}")

    with xr.open_dataset(data_path) as dataset:
        temperature = standardize_coords(dataset["temperature"]).load()

    return standardize_time_coord(temperature).sortby("time")


def weekly_anomalies_by_depth(temperature: xr.DataArray) -> pd.DataFrame:
    """Calculate weekly temperature anomalies relative to each week's mean."""
    anomalies = {}
    for depth in TARGET_DEPTHS:
        series = select_depth_timeseries(temperature, depth).to_series().dropna()
        temperature_frame = series.to_frame(name="temperature")
        temperature_frame.index = pd.to_datetime(temperature_frame.index)

        weekly = temperature_frame.resample("W").mean().dropna()
        weekly["weekofyear"] = weekly.index.isocalendar().week
        weekly_climatology = weekly.groupby("weekofyear")["temperature"].mean()
        anomalies[depth] = weekly["temperature"] - weekly["weekofyear"].map(weekly_climatology)

    anomaly_frame = pd.DataFrame(anomalies)
    anomaly_frame.index = pd.to_datetime(anomaly_frame.index)
    return anomaly_frame.sort_index(axis=1)


def plot_weekly_anomalies(anomaly_frame: pd.DataFrame, output_path: Path) -> None:
    """Render a full-bleed weekly anomaly Hovmöller image."""
    figure = plt.figure(figsize=(14, 6), dpi=300)
    axis = figure.add_axes((0, 0, 1, 1))
    time_grid, depth_grid = np.meshgrid(
        mdates.date2num(anomaly_frame.index), anomaly_frame.columns
    )
    minimum = anomaly_frame.min().min(skipna=True)
    maximum = anomaly_frame.max().max(skipna=True)
    normalization = mcolors.TwoSlopeNorm(vmin=minimum, vcenter=0, vmax=maximum)

    axis.contourf(
        time_grid,
        depth_grid,
        anomaly_frame.T,
        levels=20,
        cmap="RdBu_r",
        norm=normalization,
    )
    axis.invert_yaxis()
    axis.set_axis_off()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    figure.savefig(output_path, dpi=300, pad_inches=0)
    plt.close(figure)


def write_manifest(anomaly_frame: pd.DataFrame, manifest_path: Path) -> None:
    """Write the plot extent and D3-compatible diverging color-scale metadata."""
    minimum = float(anomaly_frame.min().min(skipna=True))
    maximum = float(anomaly_frame.max().max(skipna=True))
    colormap = matplotlib.colormaps["RdBu_r"]
    color_stops = [
        {
            "offset": step / 20,
            "color": mcolors.to_hex(colormap(step / 20)),
        }
        for step in range(21)
    ]
    manifest = {
        "target_depths_m": [float(depth) for depth in anomaly_frame.columns],
        "start_date": anomaly_frame.index.min().date().isoformat(),
        "end_date": anomaly_frame.index.max().date().isoformat(),
        "colorbar": {
            "type": "diverging",
            "domain": [minimum, 0, maximum],
            "interpolator": "interpolateRdBu",
            "reverse": True,
            "colormap": "RdBu_r",
            "stops": color_stops,
            "clamp": True,
            "levels": 20,
            "missing": "transparent",
            "label": "Temperature anomaly (°C)",
            "units": "°C",
        },
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with manifest_path.open("w", encoding="utf-8") as manifest_file:
        json.dump(manifest, manifest_file, indent=2)
        manifest_file.write("\n")


def write_weekly_anomaly_parquet(anomaly_frame: pd.DataFrame, parquet_path: Path) -> None:
    """Write one time-series record per weekly timestamp and target depth."""
    time_series = (
        anomaly_frame.rename_axis("time")
        .reset_index()
        .melt(
            id_vars="time",
            var_name="depth_m",
            value_name="temperature_anomaly_c",
        )
        .sort_values(["time", "depth_m"])
    )
    parquet_path.parent.mkdir(parents=True, exist_ok=True)
    time_series.to_parquet(parquet_path, index=False)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-url", default=DEFAULT_DATA_URL)
    parser.add_argument("--output-path", type=Path, default=DEFAULT_OUTPUT_PATH)
    parser.add_argument("--manifest-path", type=Path, default=DEFAULT_MANIFEST_PATH)
    parser.add_argument("--parquet-path", type=Path, default=DEFAULT_PARQUET_PATH)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    with tempfile.TemporaryDirectory(prefix="m1-weekly-anomaly-source-") as temporary_directory:
        data_path = download_temperature_data(
            args.data_url,
            Path(temporary_directory) / "m1_temp_sal_fulltimeseries.nc",
        )
        temperature = load_temperature(data_path)
        anomalies = weekly_anomalies_by_depth(temperature)
        plot_weekly_anomalies(anomalies, args.output_path)
        write_manifest(anomalies, args.manifest_path)
        write_weekly_anomaly_parquet(anomalies, args.parquet_path)
    print(f"Saved {args.output_path}")
    print(f"Saved {args.manifest_path}")
    print(f"Saved {args.parquet_path}")


if __name__ == "__main__":
    main()
