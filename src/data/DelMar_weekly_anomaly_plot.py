#!/usr/bin/env python
"""Create weekly subsurface-temperature anomaly artifacts for Del Mar.

The ERDDAP tabledap NetCDF export is a row-based TimeSeriesProfile dataset,
unlike M1's rectangular temperature(time, depth, latitude, longitude) grid.
This module retains PASS and NOT EVALUATED temperature observations, removes
physically implausible values, converts altitude ``z`` to positive-downward
depth, and reshapes the rows before calculating anomalies.
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
DEFAULT_DATA_URL = (
    "https://sensors.erddap.caloos.org/erddap/tabledap/"
    "del-mar-mooring-1.nc?time,z,sea_water_temperature,"
    "sea_water_temperature_qc_agg"
)
DEFAULT_OUTPUT_PATH = DATA_DIRECTORY / "DelMar_tempanomaly_weekly.png"
DEFAULT_MANIFEST_PATH = DATA_DIRECTORY / "DelMar_tempanomaly_weekly_manifest.json"
DEFAULT_PARQUET_PATH = DATA_DIRECTORY / "DelMar_tempanomaly_weekly.parquet"
TARGET_DEPTHS = [float(depth) for depth in range(0, 91, 5)]
ACCEPTED_QC_FLAGS = [1, 2]
MIN_TEMPERATURE_C = -2.0
MAX_TEMPERATURE_C = 40.0
MOORING_METADATA = {
    "name": "Del Mar Mooring",
    "location": "Del Mar, CA",
}


def download_temperature_data(data_url: str, destination: Path) -> Path:
    """Download the ERDDAP NetCDF response to a temporary local path."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial_destination = destination.with_suffix(f"{destination.suffix}.part")
    request = Request(data_url, headers={"User-Agent": "DelMar-weekly-anomaly-loader/1.0"})

    try:
        with urlopen(request, timeout=300) as response, partial_destination.open("wb") as output_file:
            shutil.copyfileobj(response, output_file)
        partial_destination.replace(destination)
    finally:
        partial_destination.unlink(missing_ok=True)

    return destination


def load_temperature(data_path: Path) -> xr.DataArray:
    """Return a quality-screened Del Mar temperature array indexed by time and depth.

    QC flags 1 (PASS) and 2 (NOT EVALUATED) are retained so current data remain
    visible. The temperature envelope removes known implausible QC-2 spikes.
    The first retained timestamp is the earliest date at which the 90 m target
    level has a retained temperature. This gives all plotted depths a common start.
    """
    if not data_path.is_file():
        raise FileNotFoundError(f"Temperature dataset not found: {data_path}")

    variables = [
        "time",
        "z",
        "sea_water_temperature",
        "sea_water_temperature_qc_agg",
    ]
    with xr.open_dataset(data_path) as dataset:
        frame = dataset[variables].to_dataframe().reset_index(drop=True)

    frame = frame.rename(columns={"sea_water_temperature": "temperature"})
    frame = frame.loc[
        frame["sea_water_temperature_qc_agg"].isin(ACCEPTED_QC_FLAGS)
        & frame["temperature"].between(MIN_TEMPERATURE_C, MAX_TEMPERATURE_C)
    ].copy()
    frame["depth"] = -frame["z"]
    frame = frame.loc[frame["depth"].isin(TARGET_DEPTHS)]

    deepest_start = frame.loc[frame["depth"] == max(TARGET_DEPTHS), "time"].min()
    if pd.isna(deepest_start):
        raise ValueError(f"No retained temperature records found at {max(TARGET_DEPTHS):g} m")
    frame = frame.loc[frame["time"] >= deepest_start]

    duplicate_coordinates = frame.duplicated(["time", "depth"])
    if duplicate_coordinates.any():
        raise ValueError("Del Mar source contains duplicate time/depth temperature records")

    temperature = (
        frame.set_index(["time", "depth"])["temperature"]
        .to_xarray()
        .reindex(depth=TARGET_DEPTHS)
        .sortby("time")
    )
    temperature.attrs.update({
        "units": "degree_Celsius",
        "source_qc_flags": ",".join(map(str, ACCEPTED_QC_FLAGS)),
        "temperature_range_c": f"{MIN_TEMPERATURE_C:g} to {MAX_TEMPERATURE_C:g}",
        "start_rule": "earliest retained observation at 90 m",
    })
    return temperature


def select_depth_timeseries(data_array: xr.DataArray, target_depth: float) -> xr.DataArray:
    """Return one requested depth as a one-dimensional time series."""
    return data_array.sel(depth=target_depth).squeeze()


def weekly_temperature_and_anomalies_by_depth(
    temperature: xr.DataArray,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return weekly temperatures and week-of-year anomalies at every target depth."""
    weekly_temperatures = {}
    anomalies = {}
    for depth in TARGET_DEPTHS:
        series = select_depth_timeseries(temperature, depth).to_series().dropna()
        temperature_frame = series.to_frame(name="temperature")
        temperature_frame.index = pd.to_datetime(temperature_frame.index)

        weekly = temperature_frame.resample("W").mean().dropna()
        weekly["weekofyear"] = weekly.index.isocalendar().week
        weekly_climatology = weekly.groupby("weekofyear")["temperature"].mean()
        weekly_temperatures[depth] = weekly["temperature"]
        anomalies[depth] = weekly["temperature"] - weekly["weekofyear"].map(weekly_climatology)

    weekly_temperature_frame = pd.DataFrame(weekly_temperatures)
    weekly_temperature_frame.index = pd.to_datetime(weekly_temperature_frame.index)
    anomaly_frame = pd.DataFrame(anomalies)
    anomaly_frame.index = pd.to_datetime(anomaly_frame.index)
    return (
        weekly_temperature_frame.sort_index(axis=1),
        anomaly_frame.sort_index(axis=1),
    )


def weekly_anomalies_by_depth(temperature: xr.DataArray) -> pd.DataFrame:
    """Calculate weekly anomalies relative to each depth's week-of-year mean."""
    _, anomaly_frame = weekly_temperature_and_anomalies_by_depth(temperature)
    return anomaly_frame


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
        anomaly_frame.to_numpy(dtype=float, na_value=np.nan).T,
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
    """Write the front-end plot extent and color-scale metadata."""
    minimum = float(anomaly_frame.min().min(skipna=True))
    maximum = float(anomaly_frame.max().max(skipna=True))
    colormap = matplotlib.colormaps["RdBu_r"]
    color_stops = [
        {"offset": step / 20, "color": mcolors.to_hex(colormap(step / 20))}
        for step in range(21)
    ]
    manifest = {
        "mooring": MOORING_METADATA,
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


def write_weekly_anomaly_parquet(
    weekly_temperature_frame: pd.DataFrame,
    parquet_path: Path,
) -> None:
    """Write nonmissing weekly temperatures used by the annual chart."""
    time_series = (
        weekly_temperature_frame.rename_axis("time")
        .reset_index()
        .melt(
            id_vars="time",
            var_name="depth_m",
            value_name="weekly_temperature_c",
        )
        .dropna(subset=["weekly_temperature_c"])
    )
    time_series["week_of_year"] = time_series["time"].dt.isocalendar().week.astype("int16")
    time_series = time_series.sort_values(["time", "depth_m"])
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
    with tempfile.TemporaryDirectory(prefix="delmar-weekly-anomaly-source-") as temporary_directory:
        data_path = download_temperature_data(
            args.data_url,
            Path(temporary_directory) / "del-mar-mooring-1.nc",
        )
        temperature = load_temperature(data_path)
        weekly_temperatures, anomalies = weekly_temperature_and_anomalies_by_depth(temperature)
        plot_weekly_anomalies(anomalies, args.output_path)
        write_manifest(anomalies, args.manifest_path)
        write_weekly_anomaly_parquet(weekly_temperatures, args.parquet_path)
    print(f"Saved {args.output_path}")
    print(f"Saved {args.manifest_path}")
    print(f"Saved {args.parquet_path}")


if __name__ == "__main__":
    main()
