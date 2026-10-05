"""Observable loader for the M1 weekly anomaly plot assets.

Writes a ZIP archive, and only ZIP bytes, to stdout. The archive contains the
full-bleed PNG, D3 manifest, and long-form Parquet time series generated from
the CENCOOS M1 temperature NetCDF source.
"""

from __future__ import annotations

import io
import os
import sys
import tempfile
import zipfile
from pathlib import Path


# The loader runs non-interactively during Observable preview/build. Configure
# Matplotlib before importing the plot helper so it never tries to start a GUI.
os.environ.setdefault("MPLBACKEND", "Agg")
matplotlib_config_dir = Path(tempfile.gettempdir()) / "m1-weekly-anomaly-matplotlib"
matplotlib_config_dir.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("MPLCONFIGDIR", str(matplotlib_config_dir))

from PICES_M1_weekly_anomaly_plot import (
    DEFAULT_DATA_URL,
    download_temperature_data,
    load_temperature,
    plot_weekly_anomalies,
    weekly_anomalies_by_depth,
    write_manifest,
    write_weekly_anomaly_parquet,
)


ARCHIVE_MEMBERS = {
    "M1_tempanomaly_weekly.png": "M1_tempanomaly_weekly.png",
    "M1_tempanomaly_weekly_manifest.json": "M1_tempanomaly_weekly_manifest.json",
    "M1_tempanomaly_weekly.parquet": "M1_tempanomaly_weekly.parquet",
}
ARCHIVE_SCHEMA_VERSION = 2


def build_archive() -> bytes:
    """Generate the plot assets in a temporary directory and package them."""
    with tempfile.TemporaryDirectory(prefix="m1-weekly-anomaly-") as temporary_directory:
        output_directory = Path(temporary_directory)
        output_paths = {
            archive_name: output_directory / filename
            for archive_name, filename in ARCHIVE_MEMBERS.items()
        }

        source_path = download_temperature_data(
            DEFAULT_DATA_URL,
            output_directory / "m1_temp_sal_fulltimeseries.nc",
        )
        temperature = load_temperature(source_path)
        anomalies = weekly_anomalies_by_depth(temperature)
        plot_weekly_anomalies(anomalies, output_paths["M1_tempanomaly_weekly.png"])
        write_manifest(anomalies, output_paths["M1_tempanomaly_weekly_manifest.json"])
        write_weekly_anomaly_parquet(anomalies, output_paths["M1_tempanomaly_weekly.parquet"])

        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
            for archive_name in sorted(ARCHIVE_MEMBERS):
                archive.write(output_paths[archive_name], arcname=archive_name)
        return buffer.getvalue()


def main() -> None:
    sys.stdout.buffer.write(build_archive())


if __name__ == "__main__":
    main()
