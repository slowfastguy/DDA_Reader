#!/usr/bin/env python3
"""
Ducati DDA (Ducati Data Analyzer) GUI, Multi-Session Lap Manager & Multi-Format Exporter
Modern Cross-Platform Desktop GUI powered by PyQt6 / PySide6.
Full visual interface for decoding multiple .dda files, comparing/combining laps across sessions,
managing Reference Laps (.ddalap.json & built-in library), inspecting telemetry frames,
and exporting to Standalone Interactive HTML Visualizer, JSON, RaceChrono v3 CSV, RaceChrono Native .rcz,
Standard CSV, GPX 1.1, and Google Earth 3D KML.
"""

import os
import sys
import argparse
import importlib
import webbrowser
from pathlib import Path

# Dual Qt Library Import (PyQt6 preferred, PySide6 fallback)
try:
    from PyQt6.QtCore import Qt, QSize, QThread, pyqtSignal as Signal
    from PyQt6.QtGui import QFont, QColor, QPalette, QIcon, QAction
    from PyQt6.QtWidgets import (
        QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
        QGridLayout, QLabel, QPushButton, QLineEdit, QGroupBox,
        QTabWidget, QTableWidget, QTableWidgetItem, QHeaderView,
        QCheckBox, QTextEdit, QFileDialog, QMessageBox, QFrame,
        QDialog, QProgressBar, QComboBox, QInputDialog
    )
    QT_LIB = "PyQt6"
except ImportError:
    try:
        from PySide6.QtCore import Qt, QSize, QThread, Signal
        from PySide6.QtGui import QFont, QColor, QPalette, QIcon, QAction
        from PySide6.QtWidgets import (
            QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
            QGridLayout, QLabel, QPushButton, QLineEdit, QGroupBox,
            QTabWidget, QTableWidget, QTableWidgetItem, QHeaderView,
            QCheckBox, QTextEdit, QFileDialog, QMessageBox, QFrame,
            QDialog, QProgressBar, QComboBox, QInputDialog
        )
        QT_LIB = "PySide6"
    except ImportError:
        print("Error: Neither PyQt6 nor PySide6 could be imported.")
        print("Please install PyQt6 using: pip install PyQt6")
        sys.exit(1)

import dda_core
from dda_core import (
    DDAParser,
    DDAReferenceLap,
    DDAMultiSessionCombiner,
    SESSION_COLORS,
    compute_session_hour_names,
    load_reference_laps_library,
    save_reference_lap_to_library,
    delete_reference_lap_from_library,
)
from dda_device import DDADevice, DDARunInfo, HAS_USB


IS_MAC = sys.platform == "darwin"
IS_WIN = sys.platform.startswith("win")

if IS_WIN:
    import ctypes
    try:
        myappid = "ducati.dda.reader.pro"
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
    except Exception:
        pass


def format_lap_time(seconds: float) -> str:
    """Formats lap duration in seconds as M:SS.mmm or SS.mmm."""
    if seconds is None or seconds <= 0:
        return "--:--.---"
    mins = int(seconds // 60)
    secs = seconds - (mins * 60)
    if mins > 0:
        return f"{mins}:{secs:06.3f}"
    return f"{secs:06.3f}s"


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
QLineEdit, QComboBox {
    background-color: #141722;
    color: #ffffff;
    border: 1px solid #353c52;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 13px;
    selection-background-color: #00e5ff;
    selection-color: #000000;
}
QLineEdit:focus, QComboBox:focus {
    border: 1px solid #00e5ff;
}
QComboBox QAbstractItemView {
    background-color: #141722;
    color: #ffffff;
    selection-background-color: #00695c;
    selection-color: #ffffff;
    border: 1px solid #353c52;
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
QPushButton#GoldBtn {
    background-color: #262010;
    color: #ffd600;
    border: 1px solid #ffd600;
}
QPushButton#GoldBtn:hover {
    background-color: #3d3315;
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


class DDADownloadWorker(QThread):
    """Background worker for downloading runs from the DDA USB stick without blocking the UI."""
    sig_progress = Signal(int, int, float, str)       # cur_bytes, total_bytes, speed_kb_s, current_file
    sig_run_finished = Signal(int, str)               # run_index, saved_filepath
    sig_all_done = Signal(list)                       # list of all saved filepaths
    sig_error = Signal(str)                           # error message

    def __init__(self, device: DDADevice, runs: list, dest_folder: str):
        super().__init__()
        self.device = device
        self.runs = runs
        self.dest_folder = dest_folder
        self._is_cancelled = False

    def cancel(self):
        self._is_cancelled = True

    def run(self):
        import time
        saved_files = []
        try:
            self.device.connect()
            for idx, r in enumerate(self.runs):
                if self._is_cancelled:
                    break
                fname = r.default_filename()

                last_emit_time = 0.0

                def on_chunk(cur, tot, spd):
                    nonlocal last_emit_time
                    now = time.time()
                    if not self._is_cancelled and (now - last_emit_time >= 0.05 or cur >= tot):
                        last_emit_time = now
                        self.sig_progress.emit(cur, tot, spd, fname)

                saved_path = self.device.download_run_to_file(
                    r,
                    destination_folder=self.dest_folder,
                    filename=fname,
                    progress_callback=on_chunk
                )
                saved_files.append(saved_path)
                self.sig_run_finished.emit(r.index, saved_path)

            if not self._is_cancelled:
                self.sig_all_done.emit(saved_files)
        except Exception as e:
            self.sig_error.emit(str(e))
        finally:
            self.device.disconnect()


class DDADownloadDialog(QDialog):
    """Interactive hardware download dialog with run selection and live progress."""
    sig_load_file = Signal(str)
    sig_load_files = Signal(list)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Download from Ducati Data Analyzer Device")
        self.resize(760, 560)
        self.setMinimumSize(680, 480)

        self.device = DDADevice()
        self.worker = None
        self.runs = []
        self.downloaded_paths = []

        self._build_ui()
        self.setStyleSheet(parent.styleSheet() if parent else QSS_DARK)
        self._refresh_device()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(12)

        # 1. Device Info / Status Card
        self.dev_box = QGroupBox(" DDA Hardware Status ", self)
        dev_layout = QVBoxLayout(self.dev_box)
        dev_layout.setContentsMargins(12, 12, 12, 12)

        self.lbl_dev_status = QLabel("Scanning for DDA USB Stick...", self.dev_box)
        self.lbl_dev_status.setStyleSheet("font-size: 14px; font-weight: bold; color: #ffffff;")
        dev_layout.addWidget(self.lbl_dev_status)

        # OEM Downloader Warning Banner
        self.oem_banner = QFrame(self.dev_box)
        self.oem_banner.setStyleSheet("background-color: #e65100; border-radius: 6px; padding: 6px;")
        oem_layout = QHBoxLayout(self.oem_banner)
        oem_layout.setContentsMargins(10, 4, 10, 4)

        lbl_oem = QLabel("⚠️ OEM 'DDA Downloader' is active in system tray (holding exclusive lock).", self.oem_banner)
        lbl_oem.setStyleSheet("color: #ffffff; font-weight: bold; background: transparent;")
        oem_layout.addWidget(lbl_oem, 1)

        btn_kill_oem = QPushButton("Close OEM Downloader", self.oem_banner)
        btn_kill_oem.setStyleSheet("background-color: #11131a; color: #ffeb3b; font-weight: bold; border: 1px solid #ffeb3b;")
        btn_kill_oem.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_kill_oem.clicked.connect(self._handle_kill_oem)
        oem_layout.addWidget(btn_kill_oem)

        dev_layout.addWidget(self.oem_banner)
        self.oem_banner.setVisible(False)

        layout.addWidget(self.dev_box)

        # 2. Run Table & Selection Bar
        table_box = QGroupBox(" Recorded Sessions on Stick (Select to Copy) ", self)
        table_layout = QVBoxLayout(table_box)
        table_layout.setContentsMargins(12, 12, 12, 12)

        # Selection Toolbar
        sel_layout = QHBoxLayout()
        btn_sel_all = QPushButton("Select All", table_box)
        btn_sel_all.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_sel_all.clicked.connect(self._select_all_runs)
        sel_layout.addWidget(btn_sel_all)

        btn_sel_none = QPushButton("Select None", table_box)
        btn_sel_none.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_sel_none.clicked.connect(self._select_no_runs)
        sel_layout.addWidget(btn_sel_none)

        sel_layout.addStretch()

        btn_refresh = QPushButton("🔄 Refresh Device", table_box)
        btn_refresh.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_refresh.clicked.connect(self._refresh_device)
        sel_layout.addWidget(btn_refresh)

        table_layout.addLayout(sel_layout)

        # Runs Table
        cols = ("Copy", "Run #", "Date & Time", "Data Size", "Est. Duration")
        self.tbl_runs = QTableWidget(table_box)
        self.tbl_runs.setColumnCount(len(cols))
        self.tbl_runs.setHorizontalHeaderLabels(cols)
        self.tbl_runs.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        self.tbl_runs.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        self.tbl_runs.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        self.tbl_runs.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)
        self.tbl_runs.horizontalHeader().setSectionResizeMode(4, QHeaderView.ResizeMode.ResizeToContents)
        self.tbl_runs.setAlternatingRowColors(True)
        self.tbl_runs.setStyleSheet("QTableWidget { alternate-background-color: #1a1e2b; }")
        table_layout.addWidget(self.tbl_runs)

        layout.addWidget(table_box, 1)

        # 3. Destination Folder Selector
        dest_box = QGroupBox(" Destination Folder ", self)
        dest_layout = QHBoxLayout(dest_box)
        dest_layout.setContentsMargins(12, 12, 12, 12)

        default_dest = os.path.join(os.path.expanduser("~/Downloads"), "DDA_Runs")
        self.txt_dest = QLineEdit(dest_box)
        self.txt_dest.setText(os.path.abspath(default_dest))
        dest_layout.addWidget(self.txt_dest, 1)

        btn_browse_dest = QPushButton("Browse...", dest_box)
        btn_browse_dest.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_browse_dest.clicked.connect(self._browse_dest)
        dest_layout.addWidget(btn_browse_dest)

        layout.addWidget(dest_box)

        # 4. Progress & Action Bar
        prog_layout = QVBoxLayout()
        self.lbl_progress = QLabel("Ready.", self)
        self.lbl_progress.setStyleSheet("color: #9aa4be; font-size: 12px;")
        prog_layout.addWidget(self.lbl_progress)

        self.pbar = QProgressBar(self)
        self.pbar.setValue(0)
        self.pbar.setTextVisible(True)
        self.pbar.setStyleSheet("""
            QProgressBar {
                border: 1px solid #353c52;
                border-radius: 5px;
                text-align: center;
                background-color: #141722;
                color: #ffffff;
                font-weight: bold;
                height: 22px;
            }
            QProgressBar::chunk {
                background-color: #00e5ff;
                border-radius: 4px;
            }
        """)
        prog_layout.addWidget(self.pbar)
        layout.addLayout(prog_layout)

        # Action Buttons
        btn_box = QHBoxLayout()
        btn_box.addStretch()

        self.btn_download = QPushButton("⬇️ Download Selected Runs", self)
        self.btn_download.setObjectName("AccentBtn")
        self.btn_download.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_download.clicked.connect(self._start_download)
        btn_box.addWidget(self.btn_download)

        self.btn_close = QPushButton("Close", self)
        self.btn_close.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_close.clicked.connect(self.close)
        btn_box.addWidget(self.btn_close)

        layout.addLayout(btn_box)

    def _handle_kill_oem(self):
        self.device.kill_oem_downloader()
        self.oem_banner.setVisible(False)
        self._refresh_device()

    def _browse_dest(self):
        curr = self.txt_dest.text().strip() or os.path.join(os.path.expanduser("~/Downloads"), "DDA_Runs")
        d = QFileDialog.getExistingDirectory(self, "Select Download Directory", curr)
        if d:
            self.txt_dest.setText(os.path.abspath(d))

    def _refresh_device(self):
        self.tbl_runs.setRowCount(0)
        self.runs.clear()
        self.pbar.setValue(0)

        if self.device.is_oem_downloader_running():
            self.oem_banner.setVisible(True)
            self.lbl_dev_status.setText("⚠️ DDA Stick Found, but OEM Downloader is holding exclusive lock.")
            self.btn_download.setEnabled(False)
            return
        else:
            self.oem_banner.setVisible(False)

        if not self.device.is_connected():
            self.lbl_dev_status.setText("❌ No DDA Stick detected. Please insert the USB stick.")
            self.lbl_dev_status.setStyleSheet("font-size: 14px; font-weight: bold; color: #ff5252;")
            self.btn_download.setEnabled(False)
            return

        try:
            self.device.connect()
            serial = self.device.get_serial_number()
            flash = self.device.get_flash_info()
            self.runs = self.device.list_runs()
            self.device.disconnect()

            self.lbl_dev_status.setText(f"🟢 Connected: DDA Stick (SN: {serial}) — {len(self.runs)} Runs Stored")
            self.lbl_dev_status.setStyleSheet("font-size: 14px; font-weight: bold; color: #69f0ae;")
            self.lbl_progress.setText(f"Found {len(self.runs)} recording sessions on device.")

            self.tbl_runs.setRowCount(len(self.runs))
            for row, r in enumerate(self.runs):
                chk = QCheckBox()
                chk.setChecked(True)
                chk_widget = QWidget()
                chk_layout = QHBoxLayout(chk_widget)
                chk_layout.addWidget(chk)
                chk_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
                chk_layout.setContentsMargins(0, 0, 0, 0)
                self.tbl_runs.setCellWidget(row, 0, chk_widget)

                item_idx = QTableWidgetItem(f"Run #{r.index:02d}")
                item_idx.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                self.tbl_runs.setItem(row, 1, item_idx)

                item_dt = QTableWidgetItem(r.datetime_str)
                self.tbl_runs.setItem(row, 2, item_dt)

                item_sz = QTableWidgetItem(f"{r.size_kb:.1f} KB")
                item_sz.setTextAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
                self.tbl_runs.setItem(row, 3, item_sz)

                item_dur = QTableWidgetItem(r.duration_str)
                item_dur.setTextAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
                self.tbl_runs.setItem(row, 4, item_dur)

            self.btn_download.setEnabled(len(self.runs) > 0)
        except Exception as e:
            self.lbl_dev_status.setText(f"❌ Connection error: {e}")
            self.lbl_dev_status.setStyleSheet("font-size: 13px; font-weight: bold; color: #ff5252;")
            self.btn_download.setEnabled(False)

    def _select_all_runs(self):
        for row in range(self.tbl_runs.rowCount()):
            widget = self.tbl_runs.cellWidget(row, 0)
            if widget:
                chk = widget.findChild(QCheckBox)
                if chk:
                    chk.setChecked(True)

    def _select_no_runs(self):
        for row in range(self.tbl_runs.rowCount()):
            widget = self.tbl_runs.cellWidget(row, 0)
            if widget:
                chk = widget.findChild(QCheckBox)
                if chk:
                    chk.setChecked(False)

    def _get_selected_runs(self) -> list:
        selected = []
        for row in range(self.tbl_runs.rowCount()):
            widget = self.tbl_runs.cellWidget(row, 0)
            if widget:
                chk = widget.findChild(QCheckBox)
                if chk and chk.isChecked():
                    selected.append(self.runs[row])
        return selected

    def _start_download(self):
        selected = self._get_selected_runs()
        if not selected:
            QMessageBox.warning(self, "No Runs Selected", "Please select at least one run to download.")
            return

        raw_dest = self.txt_dest.text().strip()
        if not raw_dest or raw_dest == "downloads" or raw_dest == "/downloads":
            dest_dir = os.path.join(os.path.expanduser("~/Downloads"), "DDA_Runs")
        else:
            dest_dir = os.path.abspath(os.path.expanduser(raw_dest))

        try:
            os.makedirs(dest_dir, exist_ok=True)
        except Exception as e:
            QMessageBox.critical(self, "Invalid Destination Directory", f"Cannot create download folder:\n{dest_dir}\n\nError: {e}")
            return

        self.btn_download.setEnabled(False)
        self.btn_close.setText("Cancel")
        self.pbar.setValue(0)
        self.downloaded_paths.clear()

        self.worker = DDADownloadWorker(self.device, selected, dest_dir)
        self.worker.sig_progress.connect(self._on_worker_progress)
        self.worker.sig_run_finished.connect(self._on_worker_run_finished)
        self.worker.sig_all_done.connect(self._on_worker_all_done)
        self.worker.sig_error.connect(self._on_worker_error)
        self.worker.start()

    def _on_worker_progress(self, cur, tot, spd, fname):
        pct = int(round((cur / tot) * 100)) if tot > 0 else 0
        self.pbar.setValue(pct)
        self.lbl_progress.setText(f"Downloading {fname}: {cur/1024:.1f}/{tot/1024:.1f} KB ({spd:.1f} KB/s)")

    def _on_worker_run_finished(self, r_idx, saved_path):
        self.downloaded_paths.append(saved_path)

    def _on_worker_all_done(self, filepaths):
        self.pbar.setValue(100)
        self.lbl_progress.setText(f"✅ Download Complete! Saved {len(filepaths)} files to: {self.txt_dest.text()}")
        self.btn_download.setEnabled(True)
        self.btn_close.setText("Close")

        reply = QMessageBox.question(
            self,
            "Download Complete",
            f"Successfully downloaded {len(filepaths)} native .dda session file(s)!\n\n"
            f"Would you like to load all {len(filepaths)} downloaded session(s) into the Laps & Sessions Manager now?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.Yes
        )

        if reply == QMessageBox.StandardButton.Yes and filepaths:
            self.sig_load_files.emit(filepaths)
            self.sig_load_file.emit(filepaths[-1])
            self.accept()

    def _on_worker_error(self, err_msg):
        self.btn_download.setEnabled(True)
        self.btn_close.setText("Close")
        self.lbl_progress.setText(f"❌ Error during download: {err_msg}")
        QMessageBox.critical(self, "Download Error", f"An error occurred while downloading from DDA device:\n\n{err_msg}")

    def closeEvent(self, event):
        if self.worker and self.worker.isRunning():
            self.worker.cancel()
            self.worker.wait(2000)
        self.device.disconnect()
        event.accept()


class ReferenceLapLibraryDialog(QDialog):
    """
    Dialog for browsing the built-in Reference Lap Library (saved in dda_settings.json),
    importing/exporting standalone .ddalap.json files, and loading selected Reference Laps
    into the active multi-session workspace.
    """
    sig_select_ref_laps = Signal(list)  # list of DDAReferenceLap

    def __init__(self, parent=None, active_track: str = ""):
        super().__init__(parent)
        self.setWindowTitle("Reference Lap Library & .ddalap.json Manager")
        self.resize(860, 500)
        self.setMinimumSize(720, 400)
        self.active_track = active_track
        self.library_laps: list[DDAReferenceLap] = []

        self._build_ui()
        self.setStyleSheet(parent.styleSheet() if parent else QSS_DARK)
        self._reload_library()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(12)

        info_box = QGroupBox(" ⭐ Saved Reference Laps (Built-in Library & Shareable .ddalap.json Files) ", self)
        info_layout = QVBoxLayout(info_box)
        info_layout.setContentsMargins(12, 12, 12, 12)

        top_bar = QHBoxLayout()
        lbl_desc = QLabel(
            "Check any Reference Laps below to include them alongside your sessions, or import a standalone .ddalap.json file:",
            info_box
        )
        lbl_desc.setStyleSheet("color: #9aa4be;")
        top_bar.addWidget(lbl_desc, 1)

        btn_import = QPushButton("📂 Import .ddalap.json File...", info_box)
        btn_import.setObjectName("GoldBtn")
        btn_import.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_import.clicked.connect(self._import_ddalap_file)
        top_bar.addWidget(btn_import)

        info_layout.addLayout(top_bar)

        cols = ("Include", "Track", "Reference Name", "Lap Time", "S1 / S2 / S3", "Max Speed", "Rider / Bike", "Date")
        self.tbl_refs = QTableWidget(info_box)
        self.tbl_refs.setColumnCount(len(cols))
        self.tbl_refs.setHorizontalHeaderLabels(cols)
        self.tbl_refs.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        self.tbl_refs.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        self.tbl_refs.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        self.tbl_refs.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)
        self.tbl_refs.horizontalHeader().setSectionResizeMode(4, QHeaderView.ResizeMode.ResizeToContents)
        self.tbl_refs.horizontalHeader().setSectionResizeMode(5, QHeaderView.ResizeMode.ResizeToContents)
        self.tbl_refs.horizontalHeader().setSectionResizeMode(6, QHeaderView.ResizeMode.ResizeToContents)
        self.tbl_refs.horizontalHeader().setSectionResizeMode(7, QHeaderView.ResizeMode.ResizeToContents)
        self.tbl_refs.setAlternatingRowColors(True)
        self.tbl_refs.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.tbl_refs.setStyleSheet("QTableWidget { alternate-background-color: #1a1e2b; }")
        info_layout.addWidget(self.tbl_refs)

        act_bar = QHBoxLayout()
        btn_export = QPushButton("💾 Export Highlighted to .ddalap.json...", info_box)
        btn_export.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_export.clicked.connect(self._export_highlighted)
        act_bar.addWidget(btn_export)

        btn_delete = QPushButton("🗑️ Delete Highlighted from Library", info_box)
        btn_delete.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_delete.clicked.connect(self._delete_highlighted)
        act_bar.addWidget(btn_delete)

        act_bar.addStretch()
        info_layout.addLayout(act_bar)
        layout.addWidget(info_box, 1)

        bottom_bar = QHBoxLayout()
        bottom_bar.addStretch()

        btn_add = QPushButton("✅ Load Checked Reference Laps into Workspace", self)
        btn_add.setObjectName("AccentBtn")
        btn_add.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_add.clicked.connect(self._confirm_selection)
        bottom_bar.addWidget(btn_add)

        btn_cancel = QPushButton("Close", self)
        btn_cancel.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_cancel.clicked.connect(self.close)
        bottom_bar.addWidget(btn_cancel)

        layout.addLayout(bottom_bar)

    def _reload_library(self, newly_imported_id: str = None):
        self.library_laps = load_reference_laps_library()
        self.tbl_refs.setRowCount(len(self.library_laps))

        for row, ref in enumerate(self.library_laps):
            chk = QCheckBox()
            # Pre-check if it matches the active track or was just imported
            match_track = bool(
                self.active_track
                and ref.track_name
                and self.active_track.strip().lower() == ref.track_name.strip().lower()
            )
            chk.setChecked(match_track or (newly_imported_id is not None and ref.id == newly_imported_id))
            chk_widget = QWidget()
            chk_layout = QHBoxLayout(chk_widget)
            chk_layout.addWidget(chk)
            chk_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
            chk_layout.setContentsMargins(0, 0, 0, 0)
            self.tbl_runs_chk = chk
            self.tbl_refs.setCellWidget(row, 0, chk_widget)

            s1, s2, s3 = (ref.sectors + [None, None, None])[:3]
            s_str = " / ".join(f"{s:.2f}s" if isinstance(s, (int, float)) and s > 0 else "--" for s in (s1, s2, s3))
            rider_bike = ref.rider_name or "Rider"
            if ref.bike_model:
                rider_bike += f" ({ref.bike_model})"

            vals = [
                ref.track_name or "Unknown Track",
                f"⭐ {ref.name}",
                format_lap_time(ref.duration_s),
                s_str,
                f"{ref.max_speed_kmh:.1f} km/h",
                rider_bike,
                ref.session_datetime or "--"
            ]
            for c_idx, val in enumerate(vals, start=1):
                item = QTableWidgetItem(val)
                if c_idx in (3, 4, 5):
                    item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                if c_idx == 2:
                    item.setForeground(QColor("#ffd600"))
                self.tbl_refs.setItem(row, c_idx, item)

    def _import_ddalap_file(self):
        files, _ = QFileDialog.getOpenFileNames(
            self,
            "Import Reference Lap (.ddalap.json or Session .json)",
            "",
            "DDA Reference Laps (*.ddalap.json *.json);;All Files (*)"
        )
        if not files:
            return
        last_id = None
        imported_count = 0
        for fpath in files:
            try:
                ref = DDAReferenceLap.load_file(fpath)
                save_reference_lap_to_library(ref)
                last_id = ref.id
                imported_count += 1
            except Exception as e:
                QMessageBox.warning(self, "Import Error", f"Could not import Reference Lap from:\n{fpath}\n\n{e}")
        if imported_count > 0:
            self._reload_library(newly_imported_id=last_id)

    def _export_highlighted(self):
        row = self.tbl_refs.currentRow()
        if row < 0 or row >= len(self.library_laps):
            QMessageBox.information(self, "Select Reference Lap", "Please click a Reference Lap row in the table to export.")
            return
        ref = self.library_laps[row]
        safe_name = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in f"{ref.track_name}_{ref.name}").strip("_")
        out_path, _ = QFileDialog.getSaveFileName(
            self,
            "Export Standalone Reference Lap (.ddalap.json)",
            f"{safe_name}.ddalap.json",
            "DDA Reference Lap (*.ddalap.json);;JSON Files (*.json)"
        )
        if out_path:
            try:
                ref.save_file(out_path)
                QMessageBox.information(self, "Exported Reference Lap", f"Saved standalone Reference Lap to:\n{out_path}")
            except Exception as e:
                QMessageBox.critical(self, "Export Error", str(e))

    def _delete_highlighted(self):
        row = self.tbl_refs.currentRow()
        if row < 0 or row >= len(self.library_laps):
            QMessageBox.information(self, "Select Reference Lap", "Please click a Reference Lap row in the table to delete.")
            return
        ref = self.library_laps[row]
        reply = QMessageBox.question(
            self,
            "Delete Reference Lap",
            f"Remove '{ref.name}' ({ref.track_name}) from the built-in Reference Lap Library?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No
        )
        if reply == QMessageBox.StandardButton.Yes:
            delete_reference_lap_from_library(ref.id)
            self._reload_library()

    def _confirm_selection(self):
        chosen = []
        for row, ref in enumerate(self.library_laps):
            w = self.tbl_refs.cellWidget(row, 0)
            if w:
                chk = w.findChild(QCheckBox)
                if chk and chk.isChecked():
                    chosen.append(ref)
        self.sig_select_ref_laps.emit(chosen)
        self.accept()


class DDAConverterApp(QMainWindow):

    def __init__(self):
        super().__init__()
        self.setWindowTitle("Ducati DDA Reader, Multi-Session Lap Manager & Telemetry Exporter Pro")
        self.resize(1240, 780)
        self.setMinimumSize(1020, 640)

        # Multi-session & reference lap state
        self.loaded_sessions: list[dict] = []  # [{"parser", "filepath", "session_id", "session_label", "color", "selected_laps"}]
        self.loaded_ref_laps: list[dict] = []  # [{"ref_lap", "checked"}]
        self.lap_table_row_map: list[dict] = []  # maps row index -> {"type": "session"|"ref", "session_idx": int, "lap_number": int, "ref_idx": int}
        self._suppress_lap_item_changed = False

        # Backward-compatible attributes pointing to active combined (or single) parser
        self.parser = None
        self.current_filepath = None

        self._build_ui()
        self.setStyleSheet(QSS_DARK)

        # Auto-load default file if available in directory
        for candidate in ["sample_run.dda", "Run045-192535-00.14.dda"]:
            if os.path.exists(candidate):
                self._load_dda_files([os.path.abspath(candidate)], replace=True)
                break

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

        lbl_sub = QLabel("Multi-Session Lap Manager, Reference Laps & Telemetry Visualizer", hdr_frame)
        lbl_sub.setStyleSheet("color: #ffcdd2; font-size: 13px; font-style: italic; background: transparent;")
        hdr_layout.addWidget(lbl_sub)

        hdr_layout.addStretch()

        btn_download_top = QPushButton("⚡ Download from DDA Stick", hdr_frame)
        btn_download_top.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_download_top.setStyleSheet("background-color: #11131a; color: #ffeb3b; border: 1px solid #ffeb3b; font-weight: bold; padding: 6px 14px; border-radius: 6px;")
        btn_download_top.clicked.connect(self._open_device_downloader)
        hdr_layout.addWidget(btn_download_top)

        btn_viewer_top = QPushButton("🚀 Open Interactive Viewer (Checked Sessions)", hdr_frame)
        btn_viewer_top.setObjectName("ViewerBtn")
        btn_viewer_top.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_viewer_top.clicked.connect(self._launch_viewer)
        hdr_layout.addWidget(btn_viewer_top)

        main_layout.addWidget(hdr_frame)

        # Content Container Layout
        content_widget = QWidget(central_widget)
        content_layout = QVBoxLayout(content_widget)
        content_layout.setContentsMargins(15, 12, 15, 15)
        content_layout.setSpacing(10)

        # 2. Multi-Session & Reference Lap Workspace Bar
        file_box = QGroupBox(" Telemetry Sessions & Reference Laps Workspace ", content_widget)
        file_layout = QHBoxLayout(file_box)
        file_layout.setContentsMargins(12, 10, 12, 10)
        file_layout.setSpacing(8)

        self.file_entry = QLineEdit(file_box)
        self.file_entry.setPlaceholderText("Add one or more .dda session files, load a track-day folder, or attach Reference Laps...")
        file_layout.addWidget(self.file_entry, 1)

        btn_add_files = QPushButton("📂 Add .DDA Files...", file_box)
        btn_add_files.setObjectName("AccentBtn")
        btn_add_files.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_add_files.setToolTip("Select one or multiple .dda session files to load and compare")
        btn_add_files.clicked.connect(self._browse_file)
        file_layout.addWidget(btn_add_files)

        btn_day_folder = QPushButton("📁 Load Day Folder...", file_box)
        btn_day_folder.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_day_folder.setToolTip("Load all .dda files from a directory sorted chronologically (S1, S2, S3...)")
        btn_day_folder.clicked.connect(self._load_day_folder)
        file_layout.addWidget(btn_day_folder)

        btn_ref_laps = QPushButton("⭐ Reference Laps...", file_box)
        btn_ref_laps.setObjectName("GoldBtn")
        btn_ref_laps.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_ref_laps.setToolTip("Load saved Reference Laps from library or import standalone .ddalap.json files")
        btn_ref_laps.clicked.connect(self._open_reference_lap_dialog)
        file_layout.addWidget(btn_ref_laps)

        btn_device = QPushButton("⚡ Read Stick...", file_box)
        btn_device.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_device.clicked.connect(self._open_device_downloader)
        file_layout.addWidget(btn_device)

        btn_clear_ws = QPushButton("🗑️ Clear All", file_box)
        btn_clear_ws.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_clear_ws.clicked.connect(self._clear_workspace)
        file_layout.addWidget(btn_clear_ws)

        content_layout.addWidget(file_box)

        # 3. Dynamic Multi-Session Summary Card
        stats_box = QGroupBox(" Checked Sessions & Telemetry Summary ", content_widget)
        stats_grid = QGridLayout(stats_box)
        stats_grid.setContentsMargins(15, 10, 15, 10)
        stats_grid.setVerticalSpacing(6)

        self.lbl_meta_track = QLabel("Track: --", stats_box)
        self.lbl_meta_track.setStyleSheet("font-weight: bold; color: #ffffff;")
        stats_grid.addWidget(self.lbl_meta_track, 0, 0)

        self.lbl_meta_rider = QLabel("Rider: --", stats_box)
        self.lbl_meta_rider.setStyleSheet("font-weight: bold; color: #ffffff;")
        stats_grid.addWidget(self.lbl_meta_rider, 0, 1)

        self.lbl_meta_dur = QLabel("Sessions: 0 | Total Time: 0.0m", stats_box)
        self.lbl_meta_dur.setStyleSheet("font-weight: bold; color: #00e5ff;")
        stats_grid.addWidget(self.lbl_meta_dur, 0, 2)

        self.lbl_meta_gps = QLabel("Total Distance: --", stats_box)
        self.lbl_meta_gps.setStyleSheet("font-weight: bold; color: #00e676;")
        stats_grid.addWidget(self.lbl_meta_gps, 0, 3)

        self.lbl_stat_speed = QLabel("Max Wheel Speed: -- km/h (-- mph)", stats_box)
        self.lbl_stat_speed.setStyleSheet("font-weight: bold; color: #00e5ff;")
        stats_grid.addWidget(self.lbl_stat_speed, 1, 0)

        self.lbl_stat_rpm = QLabel("Max RPM: --", stats_box)
        self.lbl_stat_rpm.setStyleSheet("font-weight: bold; color: #ffffff;")
        stats_grid.addWidget(self.lbl_stat_rpm, 1, 1)

        self.lbl_stat_lean = QLabel("Max Lean: L --° / R --°", stats_box)
        self.lbl_stat_lean.setStyleSheet("font-weight: bold; color: #ffffff;")
        stats_grid.addWidget(self.lbl_stat_lean, 1, 2)

        self.lbl_stat_alt = QLabel("Elevation: -- m to -- m", stats_box)
        stats_grid.addWidget(self.lbl_stat_alt, 1, 3)

        self.lbl_stat_gps_speed = QLabel("Max GPS Speed: -- km/h (-- mph)", stats_box)
        self.lbl_stat_gps_speed.setStyleSheet("font-weight: bold; color: #b388ff;")
        stats_grid.addWidget(self.lbl_stat_gps_speed, 2, 0)

        self.lbl_stat_slip = QLabel("Peak Wheel Slip: --", stats_box)
        self.lbl_stat_slip.setStyleSheet("font-weight: bold; color: #ffd600;")
        stats_grid.addWidget(self.lbl_stat_slip, 2, 1)

        self.lbl_stat_temp = QLabel("Coolant Temp: -- °C", stats_box)
        self.lbl_stat_temp.setStyleSheet("font-weight: bold; color: #ff9100;")
        stats_grid.addWidget(self.lbl_stat_temp, 2, 2)

        self.lbl_stat_odo = QLabel("Odometer: -- km", stats_box)
        stats_grid.addWidget(self.lbl_stat_odo, 2, 3)

        content_layout.addWidget(stats_box)

        # 4. Multi-Tabbed Workspace (Tab 1: Sessions & Reference Laps, Tab 2: Raw Frame Inspector, Tab 3: Export Hub, Tab 4: Log)
        self.tabs = QTabWidget(content_widget)

        # =========================================================
        # Tab 1: Sessions & Reference Laps Manager (Primary View)
        # =========================================================
        tab_laps = QWidget()
        laps_layout = QVBoxLayout(tab_laps)
        laps_layout.setContentsMargins(10, 10, 10, 10)
        laps_layout.setSpacing(8)

        # Quick Selection & Info Toolbar
        filter_bar = QHBoxLayout()
        filter_bar.setSpacing(8)

        btn_all_laps = QPushButton("✅ Select All Sessions", tab_laps)
        btn_all_laps.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_all_laps.clicked.connect(self._select_all_laps)
        filter_bar.addWidget(btn_all_laps)

        btn_none_laps = QPushButton("⬜ Select None", tab_laps)
        btn_none_laps.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_none_laps.clicked.connect(self._select_no_laps)
        filter_bar.addWidget(btn_none_laps)

        lbl_gate_hint = QLabel(
            "💡 Laps & sector splits are dynamically sliced per session through the Start/Finish & Sector gates in the Interactive Viewer.",
            tab_laps
        )
        lbl_gate_hint.setStyleSheet("color: #9aa4be; font-style: italic; margin-left: 8px;")
        filter_bar.addWidget(lbl_gate_hint)

        filter_bar.addStretch()

        btn_rem_session = QPushButton("🗑️ Remove Highlighted Row", tab_laps)
        btn_rem_session.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_rem_session.clicked.connect(self._remove_highlighted_session)
        filter_bar.addWidget(btn_rem_session)

        laps_layout.addLayout(filter_bar)

        # Sessions & Reference Laps Table
        lap_cols = (
            "Include",
            "Session",
            "Source File / Name",
            "Date & Time",
            "Duration",
            "Distance",
            "Frames",
            "Max Speed (W / GPS)",
            "Max Lean (L / R)",
            "Max RPM",
            "Action"
        )
        self.lap_table = QTableWidget(tab_laps)
        self.lap_table.setColumnCount(len(lap_cols))
        self.lap_table.setHorizontalHeaderLabels(lap_cols)
        self.lap_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        self.lap_table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        self.lap_table.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        self.lap_table.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)
        self.lap_table.horizontalHeader().setSectionResizeMode(4, QHeaderView.ResizeMode.ResizeToContents)
        self.lap_table.horizontalHeader().setSectionResizeMode(5, QHeaderView.ResizeMode.ResizeToContents)
        self.lap_table.horizontalHeader().setSectionResizeMode(6, QHeaderView.ResizeMode.ResizeToContents)
        self.lap_table.horizontalHeader().setSectionResizeMode(7, QHeaderView.ResizeMode.ResizeToContents)
        self.lap_table.horizontalHeader().setSectionResizeMode(8, QHeaderView.ResizeMode.ResizeToContents)
        self.lap_table.horizontalHeader().setSectionResizeMode(9, QHeaderView.ResizeMode.ResizeToContents)
        self.lap_table.horizontalHeader().setSectionResizeMode(10, QHeaderView.ResizeMode.ResizeToContents)
        self.lap_table.setAlternatingRowColors(True)
        self.lap_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.lap_table.setStyleSheet("QTableWidget { alternate-background-color: #1a1e2b; }")
        self.lap_table.itemSelectionChanged.connect(self._on_lap_table_selection_changed)
        laps_layout.addWidget(self.lap_table)

        self.tabs.addTab(tab_laps, " 🏁 Sessions & Reference Laps ")

        # =========================================================
        # Tab 2: Raw Frame Inspector (Secondary Tab)
        # =========================================================
        tab_inspector = QWidget()
        insp_layout = QVBoxLayout(tab_inspector)
        insp_layout.setContentsMargins(10, 10, 10, 10)
        insp_layout.setSpacing(8)

        insp_top = QHBoxLayout()
        lbl_insp_filter = QLabel("Inspect Telemetry Frames For:", tab_inspector)
        lbl_insp_filter.setStyleSheet("font-weight: bold; color: #9aa4be;")
        insp_top.addWidget(lbl_insp_filter)

        self.cmb_frame_filter = QComboBox(tab_inspector)
        self.cmb_frame_filter.setMinimumWidth(340)
        self.cmb_frame_filter.currentIndexChanged.connect(self._populate_raw_frame_table)
        insp_top.addWidget(self.cmb_frame_filter)

        self.lbl_frame_count = QLabel("", tab_inspector)
        self.lbl_frame_count.setStyleSheet("color: #9aa4be;")
        insp_top.addWidget(self.lbl_frame_count)
        insp_top.addStretch()

        insp_layout.addLayout(insp_top)

        cols = ("Time (s)", "Speed (Wheel)", "Speed (GPS)", "Wheel Slip", "RPM", "TPS", "Gear", "Lean (°)", "Temp (°C)", "DTC Fast", "DTC Slow", "Odo (km)", "Latitude", "Longitude", "Altitude (m)")
        self.tree = QTableWidget(tab_inspector)
        self.tree.setColumnCount(len(cols))
        self.tree.setHorizontalHeaderLabels(cols)
        self.tree.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        self.tree.setAlternatingRowColors(True)
        self.tree.setStyleSheet("QTableWidget { alternate-background-color: #1a1e2b; }")
        insp_layout.addWidget(self.tree)

        self.tabs.addTab(tab_inspector, " 🔍 Raw Frame Inspector ")

        # =========================================================
        # Tab 3: Export Hub
        # =========================================================
        tab_export = QWidget()
        exp_layout = QVBoxLayout(tab_export)
        exp_layout.setContentsMargins(15, 15, 15, 15)
        exp_layout.setSpacing(12)

        lbl_exp_info = QLabel("Export Checked Laps & Sessions (Combined) into Visualizers, Telemetry, and GPS Formats:", tab_export)
        lbl_exp_info.setStyleSheet("font-weight: bold; color: #ffffff;")
        exp_layout.addWidget(lbl_exp_info)

        # Button Grid
        btn_grid = QGridLayout()
        btn_grid.setSpacing(10)

        btn_html = QPushButton("🌐 Export Standalone HTML Visualizer\n(Self-Contained Multi-Session Dashboard)", tab_export)
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

        btn_json = QPushButton("📊 Export Telemetry JSON\n(Combined Multi-Session JSON Bundle)", tab_export)
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
        batch_box = QGroupBox(" Batch Directory Conversion (Individual .DDA Files in Folder) ", tab_export)
        batch_layout = QVBoxLayout(batch_box)
        batch_layout.setContentsMargins(12, 12, 12, 12)

        lbl_batch = QLabel("Choose which file formats to generate for each .dda file in a target folder:", batch_box)
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

        self.tabs.addTab(tab_export, " 📦 Export Hub ")

        # =========================================================
        # Tab 4: Processing Log
        # =========================================================
        tab_log = QWidget()
        log_layout = QVBoxLayout(tab_log)
        log_layout.setContentsMargins(8, 8, 8, 8)

        self.txt_log = QTextEdit(tab_log)
        self.txt_log.setReadOnly(True)
        log_layout.addWidget(self.txt_log)

        self.tabs.addTab(tab_log, " 📋 Processing Log ")

        content_layout.addWidget(self.tabs)
        main_layout.addWidget(content_widget)

    # =========================================================
    # Workspace & File Loading Methods
    # =========================================================

    def _log(self, msg):
        self.txt_log.append(msg)

    def _browse_file(self):
        files, _ = QFileDialog.getOpenFileNames(
            self,
            "Select One or Multiple Ducati DDA Telemetry Files",
            "",
            "Ducati DDA Files (*.dda);;All Files (*)"
        )
        if files:
            self._load_dda_files(files, replace=False)

    def _load_day_folder(self):
        folder = QFileDialog.getExistingDirectory(self, "Select Track Day Folder Containing .dda Sessions")
        if not folder:
            return
        dda_files = [
            os.path.join(folder, f)
            for f in sorted(os.listdir(folder))
            if f.lower().endswith(".dda")
        ]
        if not dda_files:
            QMessageBox.information(self, "No DDA Files Found", f"No .dda files were found in:\n{folder}")
            return
        self._load_dda_files(dda_files, replace=True)

    def _open_reference_lap_dialog(self):
        active_track = ""
        if self.loaded_sessions:
            active_track = self.loaded_sessions[0]["parser"].header.track_name or ""
        dlg = ReferenceLapLibraryDialog(self, active_track=active_track)
        dlg.sig_select_ref_laps.connect(self._on_reference_laps_selected)
        dlg.exec()

    def _on_reference_laps_selected(self, ref_laps: list):
        existing_ids = {item["ref_lap"].id for item in self.loaded_ref_laps}
        added = 0
        for ref in ref_laps:
            if ref.id not in existing_ids:
                self.loaded_ref_laps.append({"ref_lap": ref, "checked": True})
                existing_ids.add(ref.id)
                added += 1
            else:
                for item in self.loaded_ref_laps:
                    if item["ref_lap"].id == ref.id:
                        item["checked"] = True
        if added > 0:
            self._log(f"[+] Added {added} Reference Lap(s) to workspace.")
        self._refresh_workspace_views()

    def _open_device_downloader(self):
        dlg = DDADownloadDialog(self)
        dlg.sig_load_files.connect(self._on_device_files_downloaded)
        dlg.exec()

    def _on_device_files_downloaded(self, filepaths: list):
        valid = [os.path.abspath(p) for p in filepaths if os.path.exists(p)]
        if valid:
            self._load_dda_files(valid, replace=False)

    def _on_device_file_downloaded(self, filepath: str):
        if os.path.exists(filepath):
            self._load_dda_files([os.path.abspath(filepath)], replace=False)

    def _clear_workspace(self):
        self.loaded_sessions.clear()
        self.loaded_ref_laps.clear()
        self.lap_table_row_map.clear()
        self.parser = None
        self.current_filepath = None
        self.file_entry.clear()
        self.lap_table.setRowCount(0)
        self.cmb_frame_filter.clear()
        self.tree.setRowCount(0)
        self.txt_log.clear()
        self._update_summary_from_selection()

    def _parse_file(self):
        """Backward-compatible single file parse entry point (reads path from self.file_entry)."""
        raw_fpath = self.file_entry.text().strip().strip('"').strip("'")
        raw_fpath = raw_fpath.lstrip("\u202a\u202b\u202c\u200e\u200f\ufeff").strip()
        if raw_fpath.lower().startswith("file:///"):
            from urllib.parse import unquote
            raw_fpath = unquote(raw_fpath[8:])
        fpath = os.path.normpath(raw_fpath) if raw_fpath else ""
        if not fpath or not os.path.isfile(fpath):
            QMessageBox.critical(self, "File Error", f"Please select a valid .dda file.\n\nPath not found:\n{fpath or '(empty)'}")
            return
        self._load_dda_files([fpath], replace=True)

    def _load_dda_files(self, filepaths: list[str], replace: bool = False):
        """Loads and parses one or multiple .dda files into the multi-session workspace."""
        if replace:
            self.loaded_sessions.clear()
            self.txt_log.clear()

        existing_paths = {os.path.abspath(s["filepath"]) for s in self.loaded_sessions if s.get("filepath")}
        newly_parsed = []

        for raw_p in filepaths:
            fpath = os.path.abspath(os.path.normpath(raw_p))
            if not os.path.isfile(fpath):
                continue
            if fpath in existing_paths and not replace:
                self._log(f"[*] Skipping already loaded file: {os.path.basename(fpath)}")
                continue

            self._log(f"[*] Opening and analyzing DDA file: {fpath}")
            try:
                p = dda_core.DDAParser(fpath)
                count = p.parse()
                self._log(f"[+] Decoded {count:,} frames, {len(p.laps)} segments ({p.header.track_name or 'Unknown Track'} | {p.header.session_datetime})")
                newly_parsed.append((fpath, p))
                existing_paths.add(fpath)
            except Exception as e:
                import traceback
                self._log(f"[-] Error loading {fpath}: {e}\n{traceback.format_exc()}")
                QMessageBox.critical(self, "Parsing Error", f"Failed to decode DDA file:\n{fpath}\n\n{e}")

        if not newly_parsed and not self.loaded_sessions:
            return

        for fpath, p in newly_parsed:
            self.loaded_sessions.append({
                "parser": p,
                "filepath": fpath,
                "session_id": "",
                "session_label": "",
                "color": "",
                "checked": True
            })

        # Sort loaded sessions chronologically by unix_timestamp, run_number, odometer, then filename
        self.loaded_sessions.sort(key=lambda s: (
            s["parser"].header.unix_timestamp or 0.0,
            s["parser"].header.run_number or 0,
            s["parser"].header.header_odometer_km or 0,
            os.path.basename(s["filepath"])
        ))

        # Assign sequential S1, S2, S3 IDs, hour-based session labels (e.g. "2PM" or "2PM Run 1"), and colors
        hour_names = compute_session_hour_names([s["parser"].header for s in self.loaded_sessions])
        for idx, s in enumerate(self.loaded_sessions):
            s_id = f"S{idx + 1}"
            s["session_id"] = s_id
            s["session_label"] = hour_names[idx]
            s["color"] = SESSION_COLORS[idx % len(SESSION_COLORS)]

        # Auto-attach matching Reference Laps from library if none loaded yet
        if self.loaded_sessions and not self.loaded_ref_laps:
            primary_track = self.loaded_sessions[0]["parser"].header.track_name
            if primary_track and primary_track not in ("Unknown Track", "Custom Session"):
                matching_refs = load_reference_laps_library(primary_track)
                for ref in matching_refs:
                    self.loaded_ref_laps.append({"ref_lap": ref, "checked": False})

        # Update file entry summary text
        if len(self.loaded_sessions) == 1:
            self.file_entry.setText(self.loaded_sessions[0]["filepath"])
            self.current_filepath = self.loaded_sessions[0]["filepath"]
        elif len(self.loaded_sessions) > 1:
            names = ", ".join(os.path.basename(s["filepath"]) for s in self.loaded_sessions)
            self.file_entry.setText(f"[{len(self.loaded_sessions)} Sessions Loaded] {names}")
            self.current_filepath = self.loaded_sessions[0]["filepath"]

        self._refresh_workspace_views()

    # =========================================================
    # Sessions & Reference Laps Table, Selection & Actions
    # =========================================================

    def _refresh_workspace_views(self):
        """Rebuilds the Sessions & Reference Laps Table, Raw Frame Inspector filter dropdown, and Dynamic Summary Card."""
        self._populate_lap_table()
        self._populate_frame_filter_combo()
        self._update_summary_from_selection()

    def _populate_lap_table(self):
        self._suppress_lap_item_changed = True
        self.lap_table.setRowCount(0)
        self.lap_table_row_map.clear()

        rows_data = []
        for s_idx, s in enumerate(self.loaded_sessions):
            rows_data.append({
                "type": "session",
                "session_idx": s_idx,
                "session": s
            })

        for r_idx, r_item in enumerate(self.loaded_ref_laps):
            rows_data.append({
                "type": "ref",
                "ref_idx": r_idx,
                "ref_item": r_item,
                "ref_lap": r_item["ref_lap"]
            })

        self.lap_table.setRowCount(len(rows_data))

        for row_idx, rdata in enumerate(rows_data):
            self.lap_table_row_map.append(rdata)

            if rdata["type"] == "session":
                s = rdata["session"]
                p: DDAParser = s["parser"]
                is_checked = bool(s.get("checked", True))
                s_color = QColor(s["color"])

                # Col 0: Checkbox
                chk = QCheckBox()
                chk.setChecked(is_checked)
                chk.stateChanged.connect(lambda state, r=row_idx: self._on_lap_checkbox_toggled(r, state))
                chk_w = QWidget()
                chk_l = QHBoxLayout(chk_w)
                chk_l.addWidget(chk)
                chk_l.setAlignment(Qt.AlignmentFlag.AlignCenter)
                chk_l.setContentsMargins(0, 0, 0, 0)
                self.lap_table.setCellWidget(row_idx, 0, chk_w)

                # Col 1: Session Name (Hour / Run)
                item_sess = QTableWidgetItem(s["session_label"] or s["session_id"])
                item_sess.setForeground(s_color)
                item_sess.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                self.lap_table.setItem(row_idx, 1, item_sess)

                # Col 2: Source File / Name
                fname = os.path.basename(s["filepath"])
                trk = p.header.track_name or ""
                title_str = f"{fname} ({trk})" if trk and trk != "Unknown Track" else fname
                item_name = QTableWidgetItem(title_str)
                item_name.setForeground(s_color)
                self.lap_table.setItem(row_idx, 2, item_name)

                # Col 3: Date & Time
                dt_str = p.header.session_datetime or "--"
                item_dt = QTableWidgetItem(dt_str)
                item_dt.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                self.lap_table.setItem(row_idx, 3, item_dt)

                # Col 4: Duration
                dur_s = (p.records[-1].time_s - p.records[0].time_s) if len(p.records) >= 2 else 0.0
                item_dur = QTableWidgetItem(format_lap_time(dur_s))
                item_dur.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                self.lap_table.setItem(row_idx, 4, item_dur)

                # Col 5: Distance
                dist_km = p.stats.get("total_distance_km", 0.0)
                dist_mi = p.stats.get("total_distance_mi", dist_km * 0.621371)
                item_dist = QTableWidgetItem(f"{dist_km:.2f} km ({dist_mi:.2f} mi)")
                item_dist.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                self.lap_table.setItem(row_idx, 5, item_dist)

                # Col 6: Frames
                item_frames = QTableWidgetItem(f"{len(p.records):,}")
                item_frames.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                self.lap_table.setItem(row_idx, 6, item_frames)

                # Col 7: Max Speed (W / GPS)
                w_spd = p.stats.get("max_speed_kmh", 0.0)
                g_spd = p.stats.get("max_gps_speed_kmh", 0.0)
                it_spd = QTableWidgetItem(f"{w_spd:.1f} / {g_spd:.1f} km/h")
                it_spd.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                self.lap_table.setItem(row_idx, 7, it_spd)

                # Col 8: Max Lean (L / R)
                ll = p.stats.get("max_lean_left_deg", 0.0)
                lr = p.stats.get("max_lean_right_deg", 0.0)
                it_lean = QTableWidgetItem(f"L {ll:.1f}° / R {lr:.1f}°")
                it_lean.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                self.lap_table.setItem(row_idx, 8, it_lean)

                # Col 9: Max RPM
                it_rpm = QTableWidgetItem(f"{p.stats.get('max_rpm', 0):,}")
                it_rpm.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                self.lap_table.setItem(row_idx, 9, it_rpm)

                # Col 10: Action (Remove Session)
                btn_rem = QPushButton("✕ Remove")
                btn_rem.setCursor(Qt.CursorShape.PointingHandCursor)
                btn_rem.setStyleSheet("padding: 2px 8px; font-size: 11px;")
                btn_rem.clicked.connect(lambda _, r=row_idx: self._remove_row_item(r))
                self.lap_table.setCellWidget(row_idx, 10, btn_rem)

            else:
                # Reference Lap Row
                ref_item = rdata["ref_item"]
                ref: DDAReferenceLap = rdata["ref_lap"]
                gold_color = QColor("#ffd600")

                chk = QCheckBox()
                chk.setChecked(ref_item["checked"])
                chk.stateChanged.connect(lambda state, r=row_idx: self._on_lap_checkbox_toggled(r, state))
                chk_w = QWidget()
                chk_l = QHBoxLayout(chk_w)
                chk_l.addWidget(chk)
                chk_l.setAlignment(Qt.AlignmentFlag.AlignCenter)
                chk_l.setContentsMargins(0, 0, 0, 0)
                self.lap_table.setCellWidget(row_idx, 0, chk_w)

                item_sess = QTableWidgetItem("⭐ REF")
                item_sess.setForeground(gold_color)
                item_sess.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                self.lap_table.setItem(row_idx, 1, item_sess)

                item_lap = QTableWidgetItem(f"⭐ {ref.name} ({ref.track_name})")
                item_lap.setForeground(gold_color)
                self.lap_table.setItem(row_idx, 2, item_lap)

                item_dt = QTableWidgetItem(ref.session_datetime or "Benchmark Lap")
                item_dt.setForeground(gold_color)
                item_dt.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                self.lap_table.setItem(row_idx, 3, item_dt)

                dur = ref.duration_s
                item_time = QTableWidgetItem(format_lap_time(dur))
                item_time.setForeground(gold_color)
                item_time.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                self.lap_table.setItem(row_idx, 4, item_time)

                dist_km = (ref.distance_m or 0.0) / 1000.0
                item_dist = QTableWidgetItem(f"{dist_km:.2f} km ({dist_km * 0.621371:.2f} mi)")
                item_dist.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                self.lap_table.setItem(row_idx, 5, item_dist)

                item_frames = QTableWidgetItem(f"{len(ref.records):,}")
                item_frames.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                self.lap_table.setItem(row_idx, 6, item_frames)

                it_spd = QTableWidgetItem(f"{ref.max_speed_kmh:.1f} / {ref.max_gps_speed_kmh:.1f} km/h")
                it_spd.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                self.lap_table.setItem(row_idx, 7, it_spd)

                it_lean = QTableWidgetItem(f"L {ref.max_lean_left_deg:.1f}° / R {ref.max_lean_right_deg:.1f}°")
                it_lean.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                self.lap_table.setItem(row_idx, 8, it_lean)

                it_rpm = QTableWidgetItem(f"{ref.max_rpm:,}")
                it_rpm.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                self.lap_table.setItem(row_idx, 9, it_rpm)

                btn_exp_ref = QPushButton("💾 Export .ddalap")
                btn_exp_ref.setCursor(Qt.CursorShape.PointingHandCursor)
                btn_exp_ref.setStyleSheet("padding: 2px 8px; font-size: 11px;")
                btn_exp_ref.clicked.connect(lambda _, r=row_idx: self._export_row_ref_lap(r))
                self.lap_table.setCellWidget(row_idx, 10, btn_exp_ref)

        self._suppress_lap_item_changed = False

    def _on_lap_checkbox_toggled(self, row_idx: int, state: int):
        if self._suppress_lap_item_changed or row_idx < 0 or row_idx >= len(self.lap_table_row_map):
            return
        is_checked = bool(state)
        rdata = self.lap_table_row_map[row_idx]
        if rdata["type"] == "session":
            rdata["session"]["checked"] = is_checked
        else:
            rdata["ref_item"]["checked"] = is_checked

        self._update_summary_from_selection()

    def _select_all_laps(self):
        for s in self.loaded_sessions:
            s["checked"] = True
        for r_item in self.loaded_ref_laps:
            r_item["checked"] = True
        self._populate_lap_table()
        self._update_summary_from_selection()

    def _select_no_laps(self):
        for s in self.loaded_sessions:
            s["checked"] = False
        for r_item in self.loaded_ref_laps:
            r_item["checked"] = False
        self._populate_lap_table()
        self._update_summary_from_selection()

    def _export_row_ref_lap(self, row_idx: int):
        if row_idx < 0 or row_idx >= len(self.lap_table_row_map):
            return
        rdata = self.lap_table_row_map[row_idx]
        if rdata["type"] != "ref":
            return
        ref: DDAReferenceLap = rdata["ref_lap"]
        safe_name = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in f"{ref.track_name}_{ref.name}").strip("_")
        out_path, _ = QFileDialog.getSaveFileName(
            self,
            "Export Standalone Reference Lap (.ddalap.json)",
            f"{safe_name}.ddalap.json",
            "DDA Reference Lap (*.ddalap.json);;JSON Files (*.json)"
        )
        if out_path:
            ref.save_file(out_path)
            self._log(f"[+] Exported Reference Lap to: {out_path}")

    def _remove_row_item(self, row: int):
        if row < 0 or row >= len(self.lap_table_row_map):
            return
        rdata = self.lap_table_row_map[row]
        if rdata["type"] == "session":
            s_idx = rdata["session_idx"]
            removed = self.loaded_sessions.pop(s_idx)
            self._log(f"[*] Removed session: {removed['session_label']}")
            hour_names = compute_session_hour_names([s["parser"].header for s in self.loaded_sessions])
            for idx, s in enumerate(self.loaded_sessions):
                s_id = f"S{idx + 1}"
                s["session_id"] = s_id
                s["session_label"] = hour_names[idx]
                s["color"] = SESSION_COLORS[idx % len(SESSION_COLORS)]
        else:
            r_idx = rdata["ref_idx"]
            removed_ref = self.loaded_ref_laps.pop(r_idx)
            self._log(f"[*] Removed Reference Lap from workspace: {removed_ref['ref_lap'].name}")

        self._refresh_workspace_views()

    def _remove_highlighted_session(self):
        row = self.lap_table.currentRow()
        if row < 0 or row >= len(self.lap_table_row_map):
            QMessageBox.information(self, "Select a Row", "Please click a session or reference lap row you wish to remove.")
            return
        self._remove_row_item(row)

    # =========================================================
    # Summary & Raw Frame Inspector Sync
    # =========================================================

    def _build_active_combiner(self) -> DDAParser:
        """Builds a DDAMultiSessionCombiner from all currently checked whole sessions and reference laps."""
        session_entries = []
        for s in self.loaded_sessions:
            if s.get("checked", True):
                session_entries.append({
                    "parser": s["parser"],
                    "selected_lap_numbers": None,  # Whole session stream (segmented dynamically through gates in Viewer)
                    "session_id": s["session_id"],
                    "session_label": s["session_label"],
                    "color": s["color"]
                })
        checked_refs = [r["ref_lap"] for r in self.loaded_ref_laps if r.get("checked")]

        # Fallback: if user unchecked everything, include all loaded sessions
        if not session_entries and not checked_refs and self.loaded_sessions:
            for s in self.loaded_sessions:
                session_entries.append({
                    "parser": s["parser"],
                    "selected_lap_numbers": None,
                    "session_id": s["session_id"],
                    "session_label": s["session_label"],
                    "color": s["color"]
                })

        if not session_entries and not checked_refs:
            return None

        combiner = DDAMultiSessionCombiner(session_entries=session_entries, reference_laps=checked_refs)
        self.parser = combiner
        return combiner

    def _update_summary_from_selection(self):
        combiner = self._build_active_combiner()
        if not combiner or not combiner.records:
            self.lbl_meta_track.setText("Track: --")
            self.lbl_meta_rider.setText("Rider: --")
            self.lbl_meta_dur.setText("Sessions: 0 | Total Time: 0.0m")
            self.lbl_meta_gps.setText("Total Distance: --")
            self.lbl_stat_speed.setText("Max Wheel Speed: -- km/h (-- mph)")
            self.lbl_stat_gps_speed.setText("Max GPS Speed: -- km/h (-- mph)")
            self.lbl_stat_rpm.setText("Max RPM: --")
            self.lbl_stat_lean.setText("Max Lean: L --° / R --°")
            self.lbl_stat_slip.setText("Peak Wheel Slip: --")
            self.lbl_stat_temp.setText("Coolant Temp: -- °C")
            self.lbl_stat_alt.setText("Elevation: -- m to -- m")
            self.lbl_stat_odo.setText("Odometer: -- km")
            return

        active_sess_count = len([s for s in self.loaded_sessions if s.get("checked", True)])
        ref_count = len([r for r in self.loaded_ref_laps if r.get("checked")])

        track_disp = combiner.header.track_name or "Unknown Track"
        rider_disp = combiner.header.rider_name or "Ducati Rider"
        if combiner.header.bike_model:
            rider_disp += f" [{combiner.header.bike_model}]"

        self.lbl_meta_track.setText(f"Track: {track_disp}")
        self.lbl_meta_rider.setText(f"Rider: {rider_disp}")

        dur_min = combiner.stats.get("duration_min", 0.0)
        sess_txt = f"Sessions: {active_sess_count}/{len(self.loaded_sessions)} | Total Time: {dur_min:.1f} min ({len(combiner.records):,} frames)"
        if ref_count > 0:
            sess_txt += f" (+{ref_count} Ref)"
        self.lbl_meta_dur.setText(sess_txt)

        dist_km = combiner.stats.get("total_distance_km", 0.0)
        dist_mi = combiner.stats.get("total_distance_mi", dist_km * 0.621371)
        self.lbl_meta_gps.setText(f"Total Distance: {dist_km:.2f} km ({dist_mi:.2f} mi)")

        max_spd_k = combiner.stats.get("max_speed_kmh", 0.0)
        max_spd_m = combiner.stats.get("max_speed_mph", 0.0)
        max_gps_k = combiner.stats.get("max_gps_speed_kmh", 0.0)
        max_gps_m = combiner.stats.get("max_gps_speed_mph", 0.0)
        max_slip = max((r.wheel_slip_pct for r in combiner.records), default=0.0)

        self.lbl_stat_speed.setText(f"Wheel Speed: {max_spd_k:.1f} km/h ({max_spd_m:.1f} mph)")
        self.lbl_stat_gps_speed.setText(f"GPS Speed: {max_gps_k:.1f} km/h ({max_gps_m:.1f} mph)")
        self.lbl_stat_rpm.setText(f"Max RPM: {combiner.stats.get('max_rpm', 0):,}")

        lean_l = combiner.stats.get("max_lean_left_deg", 0.0)
        lean_r = combiner.stats.get("max_lean_right_deg", 0.0)
        self.lbl_stat_lean.setText(f"Max Lean: L {lean_l:.1f}° / R {lean_r:.1f}°")
        self.lbl_stat_slip.setText(f"Peak Wheel Slip: +{max_slip:.1f}%")

        alt_min = combiner.stats.get("min_alt_m", 0.0)
        alt_max = combiner.stats.get("max_alt_m", 0.0)
        self.lbl_stat_alt.setText(f"Elevation: {alt_min:.1f} m to {alt_max:.1f} m")

        t_min = combiner.stats.get("min_temp_c", 0.0)
        t_max = combiner.stats.get("max_temp_c", 0.0)
        if t_max > 0:
            self.lbl_stat_temp.setText(f"Coolant Temp: {t_min:.0f}°C – {t_max:.0f}°C")
        else:
            self.lbl_stat_temp.setText("Coolant Temp: N/A")

        odo_end = combiner.stats.get("odometer_end_km", 0.0) or combiner.header.header_odometer_km
        if odo_end > 0:
            self.lbl_stat_odo.setText(f"Odometer: {odo_end:,.0f} km ({odo_end * 0.621371:,.0f} mi)")
        else:
            self.lbl_stat_odo.setText("Odometer: N/A")

        # Refresh Raw Frame Inspector if showing "All Checked Sessions"
        if self.cmb_frame_filter.currentIndex() == 0:
            self._populate_raw_frame_table()

    def _populate_frame_filter_combo(self):
        self.cmb_frame_filter.blockSignals(True)
        self.cmb_frame_filter.clear()
        self.cmb_frame_filter.addItem("All Checked Sessions (Combined Workspace)", {"scope": "combined"})

        for s_idx, s in enumerate(self.loaded_sessions):
            p: DDAParser = s["parser"]
            self.cmb_frame_filter.addItem(f"Session {s['session_label']} ({len(p.records):,} Frames)", {"scope": "session", "session_idx": s_idx})

        for r_idx, r_item in enumerate(self.loaded_ref_laps):
            ref: DDAReferenceLap = r_item["ref_lap"]
            self.cmb_frame_filter.addItem(
                f"⭐ REF · {ref.name} ({format_lap_time(ref.duration_s)})",
                {"scope": "ref", "ref_idx": r_idx}
            )

        self.cmb_frame_filter.blockSignals(False)
        self._populate_raw_frame_table()

    def _on_lap_table_selection_changed(self):
        row = self.lap_table.currentRow()
        if row < 0 or row >= len(self.lap_table_row_map):
            return
        rdata = self.lap_table_row_map[row]
        for idx in range(self.cmb_frame_filter.count()):
            data = self.cmb_frame_filter.itemData(idx)
            if not isinstance(data, dict):
                continue
            if rdata["type"] == "session" and data.get("scope") == "session":
                if data.get("session_idx") == rdata["session_idx"]:
                    self.cmb_frame_filter.setCurrentIndex(idx)
                    break
            elif rdata["type"] == "ref" and data.get("scope") == "ref":
                if data.get("ref_idx") == rdata["ref_idx"]:
                    self.cmb_frame_filter.setCurrentIndex(idx)
                    break

    def _populate_raw_frame_table(self):
        data = self.cmb_frame_filter.currentData()
        records = []
        if isinstance(data, dict):
            scope = data.get("scope")
            if scope == "combined":
                if self.parser and self.parser.records:
                    records = self.parser.records
            elif scope == "session":
                s_idx = data.get("session_idx", 0)
                if 0 <= s_idx < len(self.loaded_sessions):
                    records = self.loaded_sessions[s_idx]["parser"].records
            elif scope == "lap":
                s_idx = data.get("session_idx", 0)
                lap_num = data.get("lap_number", 0)
                if 0 <= s_idx < len(self.loaded_sessions):
                    p = self.loaded_sessions[s_idx]["parser"]
                    lap_obj = next((l for l in p.laps if l["lap_number"] == lap_num), None)
                    if lap_obj:
                        i1 = max(0, int(lap_obj.get("start_index", 0)))
                        i2 = min(len(p.records) - 1, int(lap_obj.get("end_index", len(p.records) - 1)))
                        records = p.records[i1:i2 + 1]
            elif scope == "ref":
                r_idx = data.get("ref_idx", 0)
                if 0 <= r_idx < len(self.loaded_ref_laps):
                    records = self.loaded_ref_laps[r_idx]["ref_lap"].records

        sampled_records = self.records_sample(records, max_rows=1500)
        self.lbl_frame_count.setText(f"Showing {len(sampled_records):,} of {len(records):,} frames")
        self.tree.setRowCount(len(sampled_records))

        for row_idx, r in enumerate(sampled_records):
            lat_str = f"{r.gps_lat:.6f}" if r.gps_lat is not None else "--"
            lon_str = f"{r.gps_lon:.6f}" if r.gps_lon is not None else "--"
            alt_str = f"{r.gps_alt_m:.1f}" if r.gps_lat is not None else "--"
            gps_spd_str = f"{r.gps_speed_kmh:.1f}" if r.gps_speed_kmh > 0 else "--"
            slip_str = f"{r.wheel_slip_pct:+.1f}%" if r.gps_speed_kmh > 5.0 else "--"
            temp_str = f"{r.temp_c:.0f}°C" if r.temp_c > 0 else "--"
            odo_str = f"{r.odometer_km:.0f}" if r.odometer_km > 0 else "--"

            vals = [
                f"{r.time_s:.2f}",
                f"{r.speed_kmh:.1f}",
                gps_spd_str,
                slip_str,
                f"{r.rpm:,}",
                f"{r.tps_pct:.1f}%",
                f"{r.gear}",
                f"{r.lean_angle_deg:.1f}°",
                temp_str,
                f"{r.torque_fast_pct:.0f}%",
                f"{r.torque_slow_pct:.0f}%",
                odo_str,
                lat_str,
                lon_str,
                alt_str
            ]

            for col_idx, val in enumerate(vals):
                item = QTableWidgetItem(val)
                item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                self.tree.setItem(row_idx, col_idx, item)

    def records_sample(self, records, max_rows=1500):
        if len(records) <= max_rows:
            return records
        step = max(1, len(records) // max_rows)
        return records[::step]

    # =========================================================
    # Interactive Viewer & Exporters
    # =========================================================

    def _get_export_base_path(self) -> str:
        if self.loaded_sessions:
            first_path = self.loaded_sessions[0]["filepath"]
            base = os.path.splitext(first_path)[0]
            if len(self.loaded_sessions) > 1:
                return f"{base}_combined_{len(self.loaded_sessions)}sessions"
            return base
        elif self.loaded_ref_laps:
            ref = self.loaded_ref_laps[0]["ref_lap"]
            safe = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in ref.track_name).strip("_")
            return os.path.join(os.getcwd(), f"{safe}_ref")
        return os.path.join(os.getcwd(), "dda_session")

    def _launch_viewer(self):
        combiner = self._build_active_combiner()
        if not combiner or not combiner.records:
            QMessageBox.warning(self, "No Data", "Please load at least one .dda session or Reference Lap first.")
            return

        base = self._get_export_base_path()
        out_html = base + "_viewer.html"
        out_json = base + ".json"

        try:
            combiner.export_json(out_json)
            combiner.export_html(out_html)
            self._log(f"[+] Generated Interactive Visualizer ({len(combiner.laps)} laps across {len(combiner.sessions)} session groups): {out_html}")
            webbrowser.open(Path(out_html).resolve().as_uri())
        except Exception as e:
            self._log(f"[-] Error launching viewer: {e}")
            QMessageBox.critical(self, "Viewer Error", f"Failed to launch visualizer:\n{e}")

    def _export(self, fmt):
        combiner = self._build_active_combiner()
        if not combiner or not combiner.records:
            QMessageBox.warning(self, "No Data", "Please load at least one .dda session or Reference Lap first.")
            return

        base_name = os.path.basename(self._get_export_base_path())
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
                combiner.export_html(out_f)
            elif fmt == "json":
                combiner.export_json(out_f)
            elif fmt == "csv":
                combiner.export_csv(out_f)
            elif fmt == "gpx":
                combiner.export_gpx(out_f)
            elif fmt == "racechrono_csv":
                combiner.export_racechrono_csv(out_f)
            elif fmt == "racechrono_rcz":
                combiner.export_racechrono_rcz(out_f)

            self._log(f"[+] Exported {fmt.upper()} ({len(combiner.laps)} selected laps) to: {out_f}")
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
    arg_parser = argparse.ArgumentParser(description="Ducati DDA Telemetry Decoder, Multi-Session Combiner & Visualizer")
    arg_parser.add_argument("file", nargs="*", help="Path(s) to one or more .dda files")
    arg_parser.add_argument("--viewer", action="store_true", help="Launch interactive browser visualizer")
    arg_parser.add_argument("--html", action="store_true", help="Export standalone HTML visualizer")
    arg_parser.add_argument("--json", action="store_true", help="Export JSON telemetry bundle")
    arg_parser.add_argument("--csv", action="store_true", help="Export standard CSV")
    arg_parser.add_argument("--racechrono", action="store_true", help="Export RaceChrono v3 CSV")
    arg_parser.add_argument("--rcz", action="store_true", help="Export RaceChrono native .rcz archive")
    arg_parser.add_argument("--gpx", action="store_true", help="Export GPX 1.1")
    arg_parser.add_argument("--ref-lap", action="append", default=[], help="Path to a .ddalap.json Reference Lap to include")
    arg_parser.add_argument("--save-ref-lap", help="Save a specific lap number as a .ddalap.json file (format: LAP_NUM:OUT_PATH)")
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
        files = args.file if isinstance(args.file, list) else [args.file]
        for f in files:
            if not os.path.exists(f):
                print(f"Error: File not found: {f}")
                sys.exit(1)

        parsed_list = []
        for idx, f in enumerate(files):
            p = DDAParser(f)
            count = p.parse()
            print(f"[+] Loaded '{f}': {count:,} telemetry frames, {len(p.laps)} segments.")
            print(f"    Track: {p.header.track_name} | Rider: {p.header.rider_name}")
            print(f"    Max Speed: {p.stats.get('max_speed_kmh', 0):.1f} km/h ({p.stats.get('max_speed_mph', 0):.1f} mph)")
            parsed_list.append(p)

        if args.save_ref_lap and parsed_list:
            parts = args.save_ref_lap.split(":", 1)
            lap_num = int(parts[0])
            out_ref = parts[1] if len(parts) > 1 else f"ref_lap_{lap_num}.ddalap.json"
            ref_obj = DDAReferenceLap.from_parser_lap(parsed_list[0], lap_num)
            ref_obj.save_file(out_ref)
            save_reference_lap_to_library(ref_obj)
            print(f"  [+] Saved Reference Lap #{lap_num} to: {out_ref}")

        ref_laps = [DDAReferenceLap.load_file(rf) for rf in (args.ref_lap or []) if os.path.exists(rf)]

        if len(parsed_list) == 1 and not ref_laps:
            target_exporter = parsed_list[0]
            base = os.path.splitext(files[0])[0]
        else:
            entries = [
                {
                    "parser": p,
                    "selected_lap_numbers": [l["lap_number"] for l in p.laps if not l.get("is_out_lap") and not l.get("is_in_lap")] or None,
                    "session_id": f"S{i + 1}"
                }
                for i, p in enumerate(parsed_list)
            ]
            target_exporter = DDAMultiSessionCombiner(session_entries=entries, reference_laps=ref_laps)
            base = os.path.splitext(files[0])[0] + (f"_combined_{len(parsed_list)}sessions" if len(parsed_list) > 1 else "_with_ref")

        target_exporter.export_json(base + ".json")
        target_exporter.export_html(base + "_viewer.html")
        target_exporter.export_racechrono_csv(base + "_racechrono_v3.csv")
        target_exporter.export_racechrono_rcz(base + ".rcz")
        target_exporter.export_csv(base + ".csv")
        target_exporter.export_gpx(base + ".gpx")
        print(f"  [+] Generated export suite for: {base}")

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
