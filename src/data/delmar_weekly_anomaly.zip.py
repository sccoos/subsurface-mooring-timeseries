"""Observable loader for the Del Mar weekly anomaly plot assets.

Writes a ZIP archive, and only ZIP bytes, to stdout. The archive contains the
full-bleed PNG, D3 manifest, and long-form Parquet time series generated from
the Del Mar ERDDAP temperature NetCDF export.
"""

from __future__ import annotations

import io
import os
import sys
import tempfile
import zipfile
from pathlib import Path


# This is the Del Mar counterpart to m1_weekly_anomaly.zip.py. Observable
# executes it non-interactively, so configure Matplotlib before its import.
os.environ.setdefault("MPLBACKEND", "Agg")
matplotlib_config_dir = Path(tempfile.gettempdir()) / "delmar-weekly-anomaly-matplotlib"
matplotlib_config_dir.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("MPLCONFIGDIR", str(matplotlib_config_dir))

from DelMar_weekly_anomaly_plot import (
    DEFAULT_DATA_URL,
    download_temperature_data,
    load_temperature,
    plot_weekly_anomalies,
    weekly_temperature_and_anomalies_by_depth,
    write_manifest,
    write_weekly_anomaly_parquet,
)


ARCHIVE_MEMBERS = {
    "DelMar_tempanomaly_weekly.png": "DelMar_tempanomaly_weekly.png",
    "DelMar_tempanomaly_weekly_manifest.json": "DelMar_tempanomaly_weekly_manifest.json",
    "DelMar_tempanomaly_weekly.parquet": "DelMar_tempanomaly_weekly.parquet",
}
ARCHIVE_SCHEMA_VERSION = 3


def build_archive() -> bytes:
    """Generate Del Mar plot assets in a temporary directory and package them."""
    with tempfile.TemporaryDirectory(prefix="delmar-weekly-anomaly-") as temporary_directory:
        output_directory = Path(temporary_directory)
        output_paths = {
            archive_name: output_directory / filename
            for archive_name, filename in ARCHIVE_MEMBERS.items()
        }

        source_path = download_temperature_data(
            DEFAULT_DATA_URL,
            output_directory / "del-mar-mooring-1.nc",
        )
        temperature = load_temperature(source_path)
        weekly_temperatures, anomalies = weekly_temperature_and_anomalies_by_depth(temperature)
        plot_weekly_anomalies(anomalies, output_paths["DelMar_tempanomaly_weekly.png"])
        write_manifest(anomalies, output_paths["DelMar_tempanomaly_weekly_manifest.json"])
        write_weekly_anomaly_parquet(
            weekly_temperatures,
            output_paths["DelMar_tempanomaly_weekly.parquet"],
        )

        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
            for archive_name in sorted(ARCHIVE_MEMBERS):
                archive.write(output_paths[archive_name], arcname=archive_name)
        return buffer.getvalue()


def main() -> None:
    sys.stdout.buffer.write(build_archive())


if __name__ == "__main__":
    main()
