#!/usr/bin/env python3
"""
Ducati DDA (Ducati Data Analyzer) GUI & Multi-Format Exporter
Modern Cross-Platform Desktop GUI powered by PyQt6 / PySide6.
Full visual interface for decoding .dda files, inspecting telemetry channels,
and exporting to Standalone Interactive HTML Visualizer, JSON, RaceChrono v3 CSV, RaceChrono Native .rcz,
Standard CSV, GPX 1.1, and Google Earth 3D KML.
Includes customizable batch directory conversion with selective output format checkboxes.
"""

import os
import sys
import argparse
import importlib
import webbrowser
from pathlib import Path

# Dual Qt Library Import (PyQt6 preferred, PySide6 fallback)
try:
    from PyQt6.QtCore import Qt, QSize
    from PyQt6.QtGui import QFont, QColor, QPalette, QIcon, QAction
    from PyQt6.QtWidgets import (
        QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
        QGridLayout, QLabel, QPushButton, QLineEdit, QGroupBox,
        QTabWidget, QTableWidget, QTableWidgetItem, QHeaderView,
        QCheckBox, QTextEdit, QFileDialog, QMessageBox, QFrame
    )
    QT_LIB = "PyQt6"
except ImportError:
    try:
        from PySide6.QtCore import Qt, QSize
        from PySide6.QtGui import QFont, QColor, QPalette, QIcon, QAction
        from PySide6.QtWidgets import (
            QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
            QGridLayout, QLabel, QPushButton, QLineEdit, QGroupBox,
            QTabWidget, QTableWidget, QTableWidgetItem, QHeaderView,
            QCheckBox, QTextEdit, QFileDialog, QMessageBox, QFrame
        )
        QT_LIB = "PySide6"
    except ImportError:
        print("Error: Neither PyQt6 nor PySide6 could be imported.")
        print("Please install PyQt6 using: pip install PyQt6")
        sys.exit(1)

import dda_core
from dda_core import DDAParser

IS_MAC = sys.platform == "darwin"
IS_WIN = sys.platform.startswith("win")

# QSS Theme Stylesheet for Modern Dark Interface
QSS_DARK = """
QMainWindow {
    background-color: #1c1f2b;
}
QWidget {
    background-color: #1c1f2b;
    color: #f0f4fc;
    font-family: -apple-system, system-ui, 'Segoe UI', sans-serif;
    font-size: 13px;
}
QGroupBox {
    background-color: #252a38;
    border: 1px solid #353c52;
    border-radius: 8px;
    margin-top: 12px;
    padding-top: 14px;
    font-weight: bold;
    font-size: 13px;
    color: #ffffff;
}
QGroupBox::title {
    subcontrol-origin: margin;
    subcontrol-position: top left;
    left: 12px;
    padding: 0 6px;
    background-color: #252a38;
    color: #ffffff;
}
QLineEdit {
    background-color: #141722;
    color: #ffffff;
    border: 1px solid #353c52;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 13px;
    selection-background-color: #00e5ff;
    selection-color: #000000;
}
QLineEdit:focus {
    border: 1px solid #00e5ff;
}
QPushButton {
    background-color: #353c52;
    color: #ffffff;
    border: 1px solid #48526e;
    border-radius: 6px;
    padding: 6px 14px;
    font-weight: bold;
}
QPushButton:hover {
    background-color: #48526e;
}
QPushButton:pressed {
    background-color: #252a38;
}
QPushButton#AccentBtn {
    background-color: #d32f2f;
    border: none;
    color: #ffffff;
}
QPushButton#AccentBtn:hover {
    background-color: #b71c1c;
}
QPushButton#ViewerBtn {
    background-color: #11131a;
    color: #00e5ff;
    border: 1px solid #00e5ff;
}
QPushButton#ViewerBtn:hover {
    background-color: #000000;
}
QPushButton#ExportHtml { background-color: #00695c; border: none; }
QPushButton#ExportHtml:hover { background-color: #00897b; }
QPushButton#ExportRc { background-color: #e65100; border: none; }
QPushButton#ExportRc:hover { background-color: #f57c00; }
QPushButton#ExportRcz { background-color: #2e7d32; border: none; }
QPushButton#ExportRcz:hover { background-color: #388e3c; }
QPushButton#ExportJson { background-color: #6a1b9a; border: none; }
QPushButton#ExportJson:hover { background-color: #8e24aa; }
QPushButton#ExportCsv { background-color: #37474f; border: none; }
QPushButton#ExportCsv:hover { background-color: #455a64; }

QTabWidget::pane {
    border: 1px solid #353c52;
    background-color: #252a38;
    border-radius: 8px;
}
QTabBar::tab {
    background-color: #252a38;
    color: #9aa4be;
    padding: 8px 18px;
    font-weight: bold;
    border-top-left-radius: 6px;
    border-top-right-radius: 6px;
    margin-right: 4px;
}
QTabBar::tab:selected {
    background-color: #d32f2f;
    color: #ffffff;
}
QTabBar::tab:hover:!selected {
    background-color: #353c52;
    color: #ffffff;
}
QTableWidget {
    background-color: #141722;
    color: #f0f4fc;
    gridline-color: #282d3c;
    border: none;
    border-radius: 6px;
}
QHeaderView::section {
    background-color: #252a38;
    color: #ffffff;
    font-weight: bold;
    border: 1px solid #353c52;
    padding: 6px;
}
QTableWidget::item:selected {
    background-color: #00695c;
    color: #ffffff;
}
QCheckBox {
    color: #ffffff;
    spacing: 8px;
    background-color: transparent;
}
QCheckBox::indicator {
    width: 16px;
    height: 16px;
    border-radius: 3px;
    border: 1px solid #353c52;
    background-color: #141722;
}
QCheckBox::indicator:checked {
    background-color: #00e5ff;
    border-color: #00e5ff;
}
QTextEdit {
    background-color: #141722;
    color: #d4d4d4;
    font-family: 'Menlo', 'Consolas', 'DejaVu Sans Mono', monospace;
    font-size: 12px;
    border: none;
    border-radius: 6px;
}
QScrollBar:vertical {
    border: none;
    background: #1c1f2b;
    width: 10px;
    margin: 0px;
}
QScrollBar::handle:vertical {
    background: #353c52;
    min-height: 20px;
    border-radius: 5px;
}
"""


class DDAConverterApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Ducati DDA Reader & Telemetry Exporter Pro")
        self.resize(1120, 720)
        self.setMinimumSize(980, 600)

        self.parser = None
        self.current_filepath = None

        self._build_ui()
        self.setStyleSheet(QSS_DARK)

        # Auto-load default file if available in directory
        default_dda = "Run045-192535-00.14.dda"
        if os.path.exists(default_dda):
            self.file_entry.setText(os.path.abspath(default_dda))
            self._parse_file()

    def _build_ui(self):
        central_widget = QWidget(self)
        self.setCentralWidget(central_widget)

        main_layout = QVBoxLayout(central_widget)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        # 1. Header Banner Frame
        hdr_frame = QFrame(central_widget)
        hdr_frame.setStyleSheet("background-color: #d32f2f; max-height: 60px;")
        hdr_layout = QHBoxLayout(hdr_frame)
        hdr_layout.setContentsMargins(20, 10, 20, 10)

        lbl_title = QLabel("DUCATI DATA ANALYZER (.DDA) CONVERTER", hdr_frame)
        lbl_title.setStyleSheet("color: #ffffff; font-size: 17px; font-weight: bold; background: transparent;")
        hdr_layout.addWidget(lbl_title)

        lbl_sub = QLabel("GPS & Chassis Dynamics Visualizer", hdr_frame)
        lbl_sub.setStyleSheet("color: #ffcdd2; font-size: 13px; font-style: italic; background: transparent;")
        hdr_layout.addWidget(lbl_sub)

        hdr_layout.addStretch()

        btn_viewer_top = QPushButton("🚀 Open Interactive Viewer", hdr_frame)
        btn_viewer_top.setObjectName("ViewerBtn")
        btn_viewer_top.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_viewer_top.clicked.connect(self._launch_viewer)
        hdr_layout.addWidget(btn_viewer_top)

        main_layout.addWidget(hdr_frame)

        # Content Container Layout
        content_widget = QWidget(central_widget)
        content_layout = QVBoxLayout(content_widget)
        content_layout.setContentsMargins(15, 15, 15, 15)
        content_layout.setSpacing(12)

        # 2. File Selection Box
        file_box = QGroupBox(" DDA Telemetry File ", content_widget)
        file_layout = QHBoxLayout(file_box)
        file_layout.setContentsMargins(12, 12, 12, 12)

        self.file_entry = QLineEdit(file_box)
        self.file_entry.setPlaceholderText("Select a .dda file or click Browse...")
        file_layout.addWidget(self.file_entry, 1)

        btn_browse = QPushButton("Browse DDA...", file_box)
        btn_browse.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_browse.clicked.connect(self._browse_file)
        file_layout.addWidget(btn_browse)

        btn_parse = QPushButton("Load & Decode", file_box)
        btn_parse.setObjectName("AccentBtn")
        btn_parse.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_parse.clicked.connect(self._parse_file)
        file_layout.addWidget(btn_parse)

        content_layout.addWidget(file_box)

        # 3. Session Summary Grid Card
        stats_box = QGroupBox(" Session Summary & Dynamics ", content_widget)
        stats_grid = QGridLayout(stats_box)
        stats_grid.setContentsMargins(15, 12, 15, 12)
        stats_grid.setVerticalSpacing(8)

        self.lbl_meta_track = QLabel("Track: --", stats_box)
        self.lbl_meta_track.setStyleSheet("font-weight: bold; color: #ffffff;")
        stats_grid.addWidget(self.lbl_meta_track, 0, 0)

        self.lbl_meta_rider = QLabel("Rider: --", stats_box)
        self.lbl_meta_rider.setStyleSheet("font-weight: bold; color: #ffffff;")
        stats_grid.addWidget(self.lbl_meta_rider, 0, 1)

        self.lbl_meta_dur = QLabel("Duration: --", stats_box)
        stats_grid.addWidget(self.lbl_meta_dur, 0, 2)

        self.lbl_meta_gps = QLabel("GPS Fixes: --", stats_box)
        stats_grid.addWidget(self.lbl_meta_gps, 0, 3)

        self.lbl_stat_speed = QLabel("Max Speed: -- km/h (-- mph)", stats_box)
        self.lbl_stat_speed.setStyleSheet("font-weight: bold; color: #ff5252;")
        stats_grid.addWidget(self.lbl_stat_speed, 1, 0)

        self.lbl_stat_rpm = QLabel("Max RPM: --", stats_box)
        self.lbl_stat_rpm.setStyleSheet("font-weight: bold; color: #ffffff;")
        stats_grid.addWidget(self.lbl_stat_rpm, 1, 1)

        self.lbl_stat_lean = QLabel("Max Lean: L --° / R --°", stats_box)
        self.lbl_stat_lean.setStyleSheet("font-weight: bold; color: #ffffff;")
        stats_grid.addWidget(self.lbl_stat_lean, 1, 2)

        self.lbl_stat_alt = QLabel("Elevation: -- m to -- m", stats_box)
        stats_grid.addWidget(self.lbl_stat_alt, 1, 3)

        content_layout.addWidget(stats_box)

        # 4. Multi-Tabbed Workspace
        self.tabs = QTabWidget(content_widget)

        # Tab 1: Telemetry Inspector
        tab_inspector = QWidget()
        insp_layout = QVBoxLayout(tab_inspector)
        insp_layout.setContentsMargins(8, 8, 8, 8)

        cols = ("Time (s)", "Speed (km/h)", "Speed (mph)", "RPM", "TPS", "Gear", "Lean (°)", "DTC Fast", "DTC Slow", "Latitude", "Longitude", "Altitude (m)")
        self.tree = QTableWidget(tab_inspector)
        self.tree.setColumnCount(len(cols))
        self.tree.setHorizontalHeaderLabels(cols)
        self.tree.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        self.tree.setAlternatingRowColors(True)
        self.tree.setStyleSheet("QTableWidget { alternate-background-color: #1a1e2b; }")
        insp_layout.addWidget(self.tree)

        self.tabs.addTab(tab_inspector, " Telemetry Inspector ")

        # Tab 2: Export Hub
        tab_export = QWidget()
        exp_layout = QVBoxLayout(tab_export)
        exp_layout.setContentsMargins(15, 15, 15, 15)
        exp_layout.setSpacing(12)

        lbl_exp_info = QLabel("Export Decoded Session into Visualizers, Telemetry, and GPS Formats:", tab_export)
        lbl_exp_info.setStyleSheet("font-weight: bold; color: #ffffff;")
        exp_layout.addWidget(lbl_exp_info)

        # Button Grid
        btn_grid = QGridLayout()
        btn_grid.setSpacing(10)

        btn_html = QPushButton("🌐 Export Standalone HTML Visualizer\n(Self-Contained Interactive Dashboard)", tab_export)
        btn_html.setObjectName("ExportHtml")
        btn_html.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_html.clicked.connect(lambda: self._export("html"))
        btn_grid.addWidget(btn_html, 0, 0)

        btn_rc = QPushButton("🏁 Export RaceChrono CSV (v3)\n(Direct RaceChrono Pro Import)", tab_export)
        btn_rc.setObjectName("ExportRc")
        btn_rc.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_rc.clicked.connect(lambda: self._export("racechrono_csv"))
        btn_grid.addWidget(btn_rc, 0, 1)

        btn_rcz = QPushButton("📦 Export RaceChrono Native (.rcz)\n(Direct App Import Archive)", tab_export)
        btn_rcz.setObjectName("ExportRcz")
        btn_rcz.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_rcz.clicked.connect(lambda: self._export("racechrono_rcz"))
        btn_grid.addWidget(btn_rcz, 0, 2)

        btn_json = QPushButton("📊 Export Telemetry JSON\n(For Web Apps & Custom Code)", tab_export)
        btn_json.setObjectName("ExportJson")
        btn_json.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_json.clicked.connect(lambda: self._export("json"))
        btn_grid.addWidget(btn_json, 1, 0)

        btn_csv = QPushButton("📄 Export Standard CSV\n(Full Telemetry & Dynamics)", tab_export)
        btn_csv.setObjectName("ExportCsv")
        btn_csv.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_csv.clicked.connect(lambda: self._export("csv"))
        btn_grid.addWidget(btn_csv, 1, 1)

        btn_gpx = QPushButton("🗺️ Export GPX (1.1)\n(GPS Track & Telemetry Ext)", tab_export)
        btn_gpx.setObjectName("ExportCsv")
        btn_gpx.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_gpx.clicked.connect(lambda: self._export("gpx"))
        btn_grid.addWidget(btn_gpx, 1, 2)

        exp_layout.addLayout(btn_grid)

        # Batch Export Section
        batch_box = QGroupBox(" Batch Directory Conversion (Select Output Formats) ", tab_export)
        batch_layout = QVBoxLayout(batch_box)
        batch_layout.setContentsMargins(12, 12, 12, 12)

        lbl_batch = QLabel("Choose which file formats to generate for each .dda file in the target folder:", batch_box)
        lbl_batch.setStyleSheet("font-weight: bold; color: #ffffff;")
        batch_layout.addWidget(lbl_batch)

        chk_grid = QGridLayout()
        self.chk_html = QCheckBox("🌐 Standalone HTML Visualizer (*_viewer.html)", batch_box)
        self.chk_html.setChecked(True)
        chk_grid.addWidget(self.chk_html, 0, 0)

        self.chk_rc_csv = QCheckBox("🏁 RaceChrono v3 CSV (*_racechrono_v3.csv)", batch_box)
        self.chk_rc_csv.setChecked(True)
        chk_grid.addWidget(self.chk_rc_csv, 0, 1)

        self.chk_rcz = QCheckBox("📦 RaceChrono Native Archive (*.rcz)", batch_box)
        self.chk_rcz.setChecked(True)
        chk_grid.addWidget(self.chk_rcz, 0, 2)

        self.chk_csv = QCheckBox("📄 Standard CSV (*.csv)", batch_box)
        self.chk_csv.setChecked(True)
        chk_grid.addWidget(self.chk_csv, 1, 0)

        self.chk_json = QCheckBox("📊 Telemetry JSON (*.json)", batch_box)
        self.chk_json.setChecked(False)
        chk_grid.addWidget(self.chk_json, 1, 1)

        self.chk_gpx = QCheckBox("🗺️ GPX Track 1.1 (*.gpx)", batch_box)
        self.chk_gpx.setChecked(False)
        chk_grid.addWidget(self.chk_gpx, 1, 2)

        batch_layout.addLayout(chk_grid)

        # Batch Action Toolbar
        act_layout = QHBoxLayout()
        btn_batch_run = QPushButton("📁 Select Folder & Convert All...", batch_box)
        btn_batch_run.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_batch_run.clicked.connect(self._batch_convert)
        act_layout.addWidget(btn_batch_run)

        btn_sel_all = QPushButton("Select All", batch_box)
        btn_sel_all.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_sel_all.clicked.connect(self._batch_select_all)
        act_layout.addWidget(btn_sel_all)

        btn_sel_rc = QPushButton("RaceChrono & HTML Only", batch_box)
        btn_sel_rc.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_sel_rc.clicked.connect(self._batch_select_racechrono_only)
        act_layout.addWidget(btn_sel_rc)

        btn_clear = QPushButton("Clear All", batch_box)
        btn_clear.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_clear.clicked.connect(self._batch_clear_all)
        act_layout.addWidget(btn_clear)

        act_layout.addStretch()
        batch_layout.addLayout(act_layout)

        exp_layout.addWidget(batch_box)
        exp_layout.addStretch()

        self.tabs.addTab(tab_export, " Export Hub ")

        # Tab 3: Log Console
        tab_log = QWidget()
        log_layout = QVBoxLayout(tab_log)
        log_layout.setContentsMargins(8, 8, 8, 8)

        self.txt_log = QTextEdit(tab_log)
        self.txt_log.setReadOnly(True)
        log_layout.addWidget(self.txt_log)

        self.tabs.addTab(tab_log, " Processing Log ")

        content_layout.addWidget(self.tabs)
        main_layout.addWidget(content_widget)

    def _log(self, msg):
        self.txt_log.append(msg)

    def _browse_file(self):
        f, _ = QFileDialog.getOpenFileName(
            self,
            "Select Ducati DDA Telemetry File",
            "",
            "Ducati DDA Files (*.dda);;All Files (*)"
        )
        if f:
            self.file_entry.setText(f)
            self._parse_file()

    def _parse_file(self):
        fpath = self.file_entry.text().strip()
        if not fpath or not os.path.exists(fpath):
            QMessageBox.critical(self, "File Error", "Please select a valid .dda file.")
            return

        self.current_filepath = fpath
        self.txt_log.clear()
        self._log(f"[*] Opening and analyzing DDA file: {fpath}")

        try:
            importlib.reload(dda_core)
            self.parser = dda_core.DDAParser(fpath)
            count = self.parser.parse()
            self._log(f"[+] Successfully decoded {count:,} telemetry frames.\n")

            # Update Metadata display
            self.lbl_meta_track.setText(f"Track: {self.parser.header.track_name or 'N/A'}")
            self.lbl_meta_rider.setText(f"Rider: {self.parser.header.rider_name or 'N/A'}")
            self.lbl_meta_dur.setText(f"Duration: {self.parser.stats.get('duration_min', 0):.2f} min ({self.parser.stats.get('duration_s', 0):.1f}s)")
            self.lbl_meta_gps.setText(f"GPS Fixes: {self.parser.stats.get('gps_fixes', 0):,}")

            # Update Dynamics display
            max_spd_k = self.parser.stats.get('max_speed_kmh', 0)
            max_spd_m = self.parser.stats.get('max_speed_mph', 0)
            self.lbl_stat_speed.setText(f"Max Speed: {max_spd_k:.1f} km/h ({max_spd_m:.1f} mph)")
            self.lbl_stat_rpm.setText(f"Max RPM: {self.parser.stats.get('max_rpm', 0):,}")

            lean_l = self.parser.stats.get('max_lean_left_deg', 0)
            lean_r = self.parser.stats.get('max_lean_right_deg', 0)
            self.lbl_stat_lean.setText(f"Max Lean: L {lean_l:.1f}° / R {lean_r:.1f}°")

            alt_min = self.parser.stats.get('min_alt_m', 0)
            alt_max = self.parser.stats.get('max_alt_m', 0)
            self.lbl_stat_alt.setText(f"Elevation: {alt_min:.1f} m to {alt_max:.1f} m")

            # Populate Table with Downsampled Records
            sampled_records = self.records_sample(self.parser.records, max_rows=1500)
            self.tree.setRowCount(len(sampled_records))

            for row_idx, r in enumerate(sampled_records):
                lat_str = f"{r.gps_lat:.6f}" if r.gps_lat is not None else "--"
                lon_str = f"{r.gps_lon:.6f}" if r.gps_lon is not None else "--"
                alt_str = f"{r.gps_alt_m:.1f}" if r.gps_lat is not None else "--"

                vals = [
                    f"{r.time_s:.2f}",
                    f"{r.speed_kmh:.1f}",
                    f"{r.speed_mph:.1f}",
                    f"{r.rpm:,}",
                    f"{r.tps_pct:.1f}%",
                    f"{r.gear}",
                    f"{r.lean_angle_deg:.1f}°",
                    f"{r.torque_fast_pct:.0f}%",
                    f"{r.torque_slow_pct:.0f}%",
                    lat_str,
                    lon_str,
                    alt_str
                ]

                for col_idx, val in enumerate(vals):
                    item = QTableWidgetItem(val)
                    item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                    self.tree.setItem(row_idx, col_idx, item)

            self._log("=" * 60)
            self._log("TELEMETRY SESSION OVERVIEW")
            self._log("=" * 60)
            self._log(f"Track Name      : {self.parser.header.track_name}")
            self._log(f"Rider Name      : {self.parser.header.rider_name}")
            self._log(f"Session Duration: {self.parser.stats.get('duration_s', 0):.1f} s ({self.parser.stats.get('duration_min', 0):.2f} min)")
            self._log(f"Total Frames    : {len(self.parser.records):,}")
            self._log(f"GPS Fixes       : {self.parser.stats.get('gps_fixes', 0):,}")
            self._log(f"Max Speed       : {max_spd_k:.1f} km/h ({max_spd_m:.1f} mph)")
            self._log(f"Max RPM         : {self.parser.stats.get('max_rpm', 0):,} RPM")
            self._log(f"Max Lean Angle  : Left {lean_l:.1f}° / Right {lean_r:.1f}°")
            self._log("=" * 60)

        except Exception as e:
            self._log(f"[-] Error loading file: {e}")
            QMessageBox.critical(self, "Parsing Error", f"Failed to decode DDA file:\n{e}")

    def records_sample(self, records, max_rows=1500):
        if len(records) <= max_rows:
            return records
        step = max(1, len(records) // max_rows)
        return records[::step]

    def _launch_viewer(self):
        if not self.parser or not self.parser.records:
            QMessageBox.warning(self, "No Data", "Please load and decode a valid .dda file first.")
            return

        base = os.path.splitext(self.current_filepath)[0]
        out_html = base + "_viewer.html"
        out_json = base + ".json"

        try:
            self.parser.export_json(out_json)
            self.parser.export_html(out_html)
            self._log(f"[+] Generated Interactive Visualizer: {out_html}")
            webbrowser.open(Path(out_html).resolve().as_uri())
        except Exception as e:
            self._log(f"[-] Error launching viewer: {e}")
            QMessageBox.critical(self, "Viewer Error", f"Failed to launch visualizer:\n{e}")

    def _export(self, fmt):
        if not self.parser or not self.parser.records:
            QMessageBox.warning(self, "No Data", "Please load and decode a valid .dda file first.")
            return

        base_name = os.path.splitext(os.path.basename(self.current_filepath))[0]
        ext_map = {
            "html": "_viewer.html",
            "json": ".json",
            "csv": ".csv",
            "gpx": ".gpx",
            "racechrono_csv": "_racechrono_v3.csv",
            "racechrono_rcz": ".rcz"
        }
        default_ext = ext_map.get(fmt, ".csv")

        out_f, _ = QFileDialog.getSaveFileName(
            self,
            f"Export {fmt.upper()} File",
            f"{base_name}{default_ext}",
            f"{fmt.upper()} Files (*{default_ext});;All Files (*)"
        )
        if not out_f:
            return

        try:
            if fmt == "html":
                self.parser.export_html(out_f)
            elif fmt == "json":
                self.parser.export_json(out_f)
            elif fmt == "csv":
                self.parser.export_csv(out_f)
            elif fmt == "gpx":
                self.parser.export_gpx(out_f)
            elif fmt == "racechrono_csv":
                self.parser.export_racechrono_csv(out_f)
            elif fmt == "racechrono_rcz":
                self.parser.export_racechrono_rcz(out_f)

            self._log(f"[+] Exported {fmt.upper()} successfully to: {out_f}")
            QMessageBox.information(self, "Export Success", f"Successfully exported file to:\n{out_f}")
        except Exception as e:
            self._log(f"[-] Export failed: {e}")
            QMessageBox.critical(self, "Export Failed", str(e))

    def _batch_select_all(self):
        self.chk_html.setChecked(True)
        self.chk_rc_csv.setChecked(True)
        self.chk_rcz.setChecked(True)
        self.chk_json.setChecked(True)
        self.chk_csv.setChecked(True)
        self.chk_gpx.setChecked(True)

    def _batch_select_racechrono_only(self):
        self.chk_html.setChecked(True)
        self.chk_rc_csv.setChecked(True)
        self.chk_rcz.setChecked(True)
        self.chk_json.setChecked(False)
        self.chk_csv.setChecked(False)
        self.chk_gpx.setChecked(False)

    def _batch_clear_all(self):
        self.chk_html.setChecked(False)
        self.chk_rc_csv.setChecked(False)
        self.chk_rcz.setChecked(False)
        self.chk_json.setChecked(False)
        self.chk_csv.setChecked(False)
        self.chk_gpx.setChecked(False)

    def _batch_convert(self):
        do_html = self.chk_html.isChecked()
        do_rc_csv = self.chk_rc_csv.isChecked()
        do_rcz = self.chk_rcz.isChecked()
        do_json = self.chk_json.isChecked()
        do_csv = self.chk_csv.isChecked()
        do_gpx = self.chk_gpx.isChecked()

        if not (do_html or do_rc_csv or do_rcz or do_json or do_csv or do_gpx):
            QMessageBox.warning(self, "No Formats Selected", "Please select at least one output format checkbox before batch converting.")
            return

        folder = QFileDialog.getExistingDirectory(self, "Select Folder Containing .dda Files")
        if not folder:
            return

        dda_files = [os.path.join(folder, f) for f in os.listdir(folder) if f.lower().endswith(".dda")]
        if not dda_files:
            QMessageBox.information(self, "No Files", "No .dda files found in the selected folder.")
            return

        success_count = 0
        formats_desc = []
        if do_html: formats_desc.append("HTML Viewer")
        if do_rc_csv: formats_desc.append("RaceChrono v3 CSV")
        if do_rcz: formats_desc.append("RaceChrono RCZ")
        if do_json: formats_desc.append("JSON")
        if do_csv: formats_desc.append("Standard CSV")
        if do_gpx: formats_desc.append("GPX")

        self._log(f"\n[*] Starting Batch Conversion of {len(dda_files)} files in: {folder}")
        self._log(f"    Selected Formats: {', '.join(formats_desc)}")

        for f in dda_files:
            try:
                p = DDAParser(f)
                p.parse()
                base = os.path.splitext(f)[0]

                if do_html: p.export_html(base + "_viewer.html")
                if do_rc_csv: p.export_racechrono_csv(base + "_racechrono_v3.csv")
                if do_rcz: p.export_racechrono_rcz(base + ".rcz")
                if do_json: p.export_json(base + ".json")
                if do_csv: p.export_csv(base + ".csv")
                if do_gpx: p.export_gpx(base + ".gpx")

                self._log(f"  [+] Converted: {os.path.basename(f)}")
                success_count += 1
            except Exception as e:
                self._log(f"  [-] Error converting {os.path.basename(f)}: {e}")

        self._log(f"[+] Batch conversion finished: {success_count}/{len(dda_files)} files converted successfully.\n")
        QMessageBox.information(self, "Batch Complete", f"Successfully converted {success_count} of {len(dda_files)} files to selected formats:\n({', '.join(formats_desc)})")


def cli_main():
    arg_parser = argparse.ArgumentParser(description="Ducati DDA Telemetry Decoder, Exporter & Visualizer")
    arg_parser.add_argument("file", nargs="?", help="Path to .dda file")
    arg_parser.add_argument("--viewer", action="store_true", help="Launch interactive browser visualizer")
    arg_parser.add_argument("--html", action="store_true", help="Export standalone HTML visualizer")
    arg_parser.add_argument("--json", action="store_true", help="Export JSON telemetry bundle")
    arg_parser.add_argument("--csv", action="store_true", help="Export standard CSV")
    arg_parser.add_argument("--racechrono", action="store_true", help="Export RaceChrono v3 CSV")
    arg_parser.add_argument("--rcz", action="store_true", help="Export RaceChrono native .rcz archive")
    arg_parser.add_argument("--gpx", action="store_true", help="Export GPX 1.1")
    arg_parser.add_argument("--formats", help="Comma-separated format list for batch conversion")
    arg_parser.add_argument("--batch", help="Batch convert all .dda files in directory")

    args = arg_parser.parse_args()

    if args.batch:
        folder = args.batch
        if not os.path.exists(folder):
            print(f"Error: Directory not found: {folder}")
            sys.exit(1)

        files = [os.path.join(folder, f) for f in os.listdir(folder) if f.lower().endswith(".dda")]
        if not files:
            print(f"No .dda files found in: {folder}")
            return

        req_formats = set()
        if args.formats:
            fmt_tokens = [t.strip().lower() for t in args.formats.split(",")]
            if "all" in fmt_tokens:
                req_formats = {"html", "racechrono", "rcz", "json", "csv", "gpx"}
            else:
                for t in fmt_tokens:
                    if t in ("html", "viewer"): req_formats.add("html")
                    elif t in ("racechrono", "rc", "rc_csv", "racechrono_csv"): req_formats.add("racechrono")
                    elif t in ("rcz", "racechrono_rcz"): req_formats.add("rcz")
                    elif t in ("json",): req_formats.add("json")
                    elif t in ("csv", "std_csv"): req_formats.add("csv")
                    elif t in ("gpx",): req_formats.add("gpx")

        if args.html: req_formats.add("html")
        if args.racechrono: req_formats.add("racechrono")
        if args.rcz: req_formats.add("rcz")
        if args.json: req_formats.add("json")
        if args.csv: req_formats.add("csv")
        if args.gpx: req_formats.add("gpx")

        if not req_formats:
            req_formats = {"html", "racechrono", "rcz", "csv"}

        print(f"Found {len(files)} .dda files in {folder}.")
        print(f"Selected Output Formats: {', '.join(sorted(req_formats))}")
        print("Starting batch conversion...")

        for f in files:
            try:
                p = DDAParser(f)
                p.parse()
                base = os.path.splitext(f)[0]
                if "html" in req_formats: p.export_html(base + "_viewer.html")
                if "racechrono" in req_formats: p.export_racechrono_csv(base + "_racechrono_v3.csv")
                if "rcz" in req_formats: p.export_racechrono_rcz(base + ".rcz")
                if "json" in req_formats: p.export_json(base + ".json")
                if "csv" in req_formats: p.export_csv(base + ".csv")
                if "gpx" in req_formats: p.export_gpx(base + ".gpx")
                print(f"  [+] Converted: {os.path.basename(f)}")
            except Exception as e:
                print(f"  [-] Error converting {os.path.basename(f)}: {e}")

        print("Batch conversion completed successfully.")
        return

    if args.file:
        if not os.path.exists(args.file):
            print(f"Error: File not found: {args.file}")
            sys.exit(1)

        p = DDAParser(args.file)
        count = p.parse()
        print(f"[+] Loaded '{args.file}': {count:,} telemetry frames.")
        print(f"    Track: {p.header.track_name} | Rider: {p.header.rider_name}")
        print(f"    Max Speed: {p.stats.get('max_speed_kmh', 0):.1f} km/h ({p.stats.get('max_speed_mph', 0):.1f} mph)")

        base = os.path.splitext(args.file)[0]
        p.export_json(base + ".json")
        p.export_html(base + "_viewer.html")
        p.export_racechrono_csv(base + "_racechrono_v3.csv")
        p.export_racechrono_rcz(base + ".rcz")
        p.export_csv(base + ".csv")
        p.export_gpx(base + ".gpx")
        print(f"  [+] Generated export suite for: {args.file}")

        if args.viewer:
            print("  [*] Launching interactive telemetry viewer in browser...")
            webbrowser.open(Path(base + "_viewer.html").resolve().as_uri())
        return

    # Otherwise launch Qt Application
    qt_app = QApplication(sys.argv)
    window = DDAConverterApp()
    window.show()
    sys.exit(qt_app.exec())


if __name__ == "__main__":
    cli_main()