#!/usr/bin/env python3
"""
Ducati DDA (Ducati Data Analyzer) GUI & Multi-Format Exporter
Full visual interface for decoding .dda files, inspecting telemetry channels,
and exporting to standard CSV, GPX 1.1, Google Earth 3D KML, RaceChrono v3 CSV, and RaceChrono Native .rcz.
Includes customizable batch directory conversion with selective output format checkboxes.
"""

import os
import sys
import argparse
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from dda_core import DDAParser


class DDAConverterApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Ducati DDA Reader & Telemetry Exporter Pro")
        self.geometry("1120x720")
        self.minsize(980, 600)

        # Set app styling
        self._setup_theme()

        self.parser = None
        self.current_filepath = None

        # Build UI Layout
        self._build_ui()

    def _setup_theme(self):
        self.style = ttk.Style(self)
        self.style.theme_use("clam")

        # Color palette
        self.bg_color = "#f4f6f9"
        self.header_bg = "#d32f2f"  # Ducati Red
        self.card_bg = "#ffffff"
        self.accent_color = "#b71c1c"
        self.text_color = "#212121"

        self.configure(bg=self.bg_color)
        self.style.configure(".", background=self.bg_color, foreground=self.text_color, font=("Segoe UI", 9))
        self.style.configure("TFrame", background=self.bg_color)
        self.style.configure("Card.TLabelframe", background=self.card_bg, relief=tk.SOLID, borderwidth=1)
        self.style.configure("Card.TLabelframe.Label", background=self.card_bg, font=("Segoe UI", 10, "bold"), foreground="#333333")
        
        self.style.configure("Accent.TButton", background=self.header_bg, foreground="#ffffff", font=("Segoe UI", 9, "bold"), borderwidth=0)
        self.style.map("Accent.TButton", background=[("active", self.accent_color), ("pressed", "#8e0000")])

        self.style.configure("Action.TButton", font=("Segoe UI", 9, "bold"))
        self.style.configure("Treeview.Heading", font=("Segoe UI", 9, "bold"), background="#e0e0e0")
        self.style.configure("Treeview", rowheight=24, font=("Segoe UI", 9))

    def _build_ui(self):
        # 1. Header Banner
        hdr_frame = tk.Frame(self, bg=self.header_bg, height=60, padx=20, pady=10)
        hdr_frame.pack(fill=tk.X)
        
        lbl_title = tk.Label(hdr_frame, text="DUCATI DATA ANALYZER (.DDA) CONVERTER", font=("Segoe UI", 14, "bold"), bg="#d32f2f", fg="#ffffff")
        lbl_title.pack(side=tk.LEFT)
        lbl_sub = tk.Label(hdr_frame, text="GPS & Chassis Dynamics Decoder", font=("Segoe UI", 10, "italic"), bg="#d32f2f", fg="#ffcdd2")
        lbl_sub.pack(side=tk.LEFT, padx=15)

        # Main Container Frame
        container = ttk.Frame(self, padding=15)
        container.pack(fill=tk.BOTH, expand=True)

        # 2. File Selection Bar
        file_frame = ttk.LabelFrame(container, text="DDA Telemetry File", style="Card.TLabelframe", padding=10)
        file_frame.pack(fill=tk.X, pady=(0, 10))

        self.file_var = tk.StringVar()
        entry = ttk.Entry(file_frame, textvariable=self.file_var, font=("Segoe UI", 10))
        entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 10))

        btn_browse = ttk.Button(file_frame, text="Browse DDA...", command=self._browse_file, style="Action.TButton")
        btn_browse.pack(side=tk.LEFT, padx=5)

        btn_parse = ttk.Button(file_frame, text="Load & Decode", command=self._parse_file, style="Accent.TButton")
        btn_parse.pack(side=tk.LEFT, padx=5)

        # 3. Session Overview Card Grid
        self.stats_frame = ttk.LabelFrame(container, text="Session Summary & Dynamics", style="Card.TLabelframe", padding=10)
        self.stats_frame.pack(fill=tk.X, pady=(0, 10))

        # Metrics display labels
        self.lbl_meta_track = ttk.Label(self.stats_frame, text="Track: --", font=("Segoe UI", 10, "bold"))
        self.lbl_meta_track.grid(row=0, column=0, sticky="w", padx=10, pady=3)

        self.lbl_meta_rider = ttk.Label(self.stats_frame, text="Rider: --", font=("Segoe UI", 10, "bold"))
        self.lbl_meta_rider.grid(row=0, column=1, sticky="w", padx=10, pady=3)

        self.lbl_meta_dur = ttk.Label(self.stats_frame, text="Duration: --", font=("Segoe UI", 10))
        self.lbl_meta_dur.grid(row=0, column=2, sticky="w", padx=10, pady=3)

        self.lbl_meta_gps_count = ttk.Label(self.stats_frame, text="GPS Fixes: --", font=("Segoe UI", 10))
        self.lbl_meta_gps_count.grid(row=0, column=3, sticky="w", padx=10, pady=3)

        self.lbl_stat_speed = ttk.Label(self.stats_frame, text="Max Speed: -- km/h (-- mph)", foreground="#c62828", font=("Segoe UI", 10, "bold"))
        self.lbl_stat_speed.grid(row=1, column=0, sticky="w", padx=10, pady=3)

        self.lbl_stat_rpm = ttk.Label(self.stats_frame, text="Max RPM: --", font=("Segoe UI", 10, "bold"))
        self.lbl_stat_rpm.grid(row=1, column=1, sticky="w", padx=10, pady=3)

        self.lbl_stat_lean = ttk.Label(self.stats_frame, text="Max Lean: L --° / R --°", font=("Segoe UI", 10, "bold"))
        self.lbl_stat_lean.grid(row=1, column=2, sticky="w", padx=10, pady=3)

        self.lbl_stat_alt = ttk.Label(self.stats_frame, text="Elevation: -- m to -- m", font=("Segoe UI", 10))
        self.lbl_stat_alt.grid(row=1, column=3, sticky="w", padx=10, pady=3)

        # 4. Multi-Tabbed Workspace
        tab_control = ttk.Notebook(container)
        tab_control.pack(fill=tk.BOTH, expand=True)

        # Tab 1: Telemetry Inspector (Treeview table)
        tab_inspector = ttk.Frame(tab_control, padding=5)
        tab_control.add(tab_inspector, text=" Telemetry Inspector ")

        cols = ("Time_s", "Speed_kmh", "Speed_mph", "RPM", "TPS", "Gear", "Lean_deg", "DTC_Fast", "DTC_Slow", "GPS_Lat", "GPS_Lon", "GPS_Alt_m")
        self.tree = ttk.Treeview(tab_inspector, columns=cols, show="headings", height=12)
        
        col_widths = {"Time_s": 65, "Speed_kmh": 80, "Speed_mph": 80, "RPM": 70, "TPS": 60, "Gear": 50, "Lean_deg": 75, "DTC_Fast": 65, "DTC_Slow": 65, "GPS_Lat": 105, "GPS_Lon": 105, "GPS_Alt_m": 75}
        for c in cols:
            self.tree.heading(c, text=c.replace("_", " "))
            self.tree.column(c, width=col_widths.get(c, 70), anchor="center")

        tree_scroll_y = ttk.Scrollbar(tab_inspector, orient=tk.VERTICAL, command=self.tree.yview)
        self.tree.configure(yscroll=tree_scroll_y.set)
        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        tree_scroll_y.pack(side=tk.RIGHT, fill=tk.Y)

        # Tab 2: Export Center
        tab_export = ttk.Frame(tab_control, padding=15)
        tab_control.add(tab_export, text=" Export Hub ")

        lbl_exp_info = ttk.Label(tab_export, text="Export Decoded Session into Telemetry, GPS, and RaceChrono Formats:", font=("Segoe UI", 11, "bold"))
        lbl_exp_info.pack(anchor="w", pady=(0, 10))

        btn_grid = ttk.Frame(tab_export)
        btn_grid.pack(fill=tk.X, pady=5)

        btn_rc_csv = tk.Button(btn_grid, text="🏁 Export RaceChrono CSV (v3)\n(Direct RaceChrono Pro Import)", font=("Segoe UI", 10, "bold"), bg="#ffecb3", relief=tk.GROOVE, padx=15, pady=10, command=lambda: self._export("racechrono_csv"))
        btn_rc_csv.grid(row=0, column=0, padx=5, pady=5, sticky="nsew")

        btn_rcz = tk.Button(btn_grid, text="📦 Export RaceChrono Native (.rcz)\n(Direct App Import Archive)", font=("Segoe UI", 10, "bold"), bg="#c8e6c9", relief=tk.GROOVE, padx=15, pady=10, command=lambda: self._export("racechrono_rcz"))
        btn_rcz.grid(row=0, column=1, padx=5, pady=5, sticky="nsew")

        btn_csv = tk.Button(btn_grid, text="📄 Export Standard CSV\n(Full Telemetry & Dynamics)", font=("Segoe UI", 10, "bold"), bg="#e0e0e0", relief=tk.GROOVE, padx=15, pady=10, command=lambda: self._export("csv"))
        btn_csv.grid(row=0, column=2, padx=5, pady=5, sticky="nsew")

        btn_gpx = tk.Button(btn_grid, text="🗺️ Export GPX (1.1)\n(GPS Track & Telemetry Ext)", font=("Segoe UI", 10, "bold"), bg="#e0e0e0", relief=tk.GROOVE, padx=15, pady=10, command=lambda: self._export("gpx"))
        btn_gpx.grid(row=1, column=0, padx=5, pady=5, sticky="nsew")

        btn_kml = tk.Button(btn_grid, text="🌐 Export KML\n(3D Google Earth Track)", font=("Segoe UI", 10, "bold"), bg="#e0e0e0", relief=tk.GROOVE, padx=15, pady=10, command=lambda: self._export("kml"))
        btn_kml.grid(row=1, column=1, padx=5, pady=5, sticky="nsew")

        btn_grid.grid_columnconfigure(0, weight=1)
        btn_grid.grid_columnconfigure(1, weight=1)
        btn_grid.grid_columnconfigure(2, weight=1)

        # Batch Export Section with Output Type Selection
        batch_frame = ttk.LabelFrame(tab_export, text="Batch Directory Conversion (Select Output Formats)", style="Card.TLabelframe", padding=12)
        batch_frame.pack(fill=tk.X, pady=15)

        ttk.Label(batch_frame, text="Choose which file formats to generate for each .dda file in the target folder:", font=("Segoe UI", 9, "bold")).pack(anchor="w", pady=(0, 8))

        # Checkbox format options
        self.batch_opt_rc_csv = tk.BooleanVar(value=True)
        self.batch_opt_rcz = tk.BooleanVar(value=True)
        self.batch_opt_csv = tk.BooleanVar(value=True)
        self.batch_opt_gpx = tk.BooleanVar(value=False)
        self.batch_opt_kml = tk.BooleanVar(value=False)

        chk_box_frame = ttk.Frame(batch_frame)
        chk_box_frame.pack(fill=tk.X, pady=3)

        cb1 = ttk.Checkbutton(chk_box_frame, text="🏁 RaceChrono v3 CSV (*_racechrono_v3.csv)", variable=self.batch_opt_rc_csv)
        cb1.grid(row=0, column=0, sticky="w", padx=8, pady=4)

        cb2 = ttk.Checkbutton(chk_box_frame, text="📦 RaceChrono Native Archive (*.rcz)", variable=self.batch_opt_rcz)
        cb2.grid(row=0, column=1, sticky="w", padx=8, pady=4)

        cb3 = ttk.Checkbutton(chk_box_frame, text="📄 Standard CSV (*.csv)", variable=self.batch_opt_csv)
        cb3.grid(row=0, column=2, sticky="w", padx=8, pady=4)

        cb4 = ttk.Checkbutton(chk_box_frame, text="🗺️ GPX Track 1.1 (*.gpx)", variable=self.batch_opt_gpx)
        cb4.grid(row=1, column=0, sticky="w", padx=8, pady=4)

        cb5 = ttk.Checkbutton(chk_box_frame, text="🌐 Google Earth KML (*.kml)", variable=self.batch_opt_kml)
        cb5.grid(row=1, column=1, sticky="w", padx=8, pady=4)

        # Batch Actions Toolbar
        batch_act_frame = ttk.Frame(batch_frame)
        batch_act_frame.pack(fill=tk.X, pady=(10, 0))

        btn_batch_run = ttk.Button(batch_act_frame, text="📁 Select Folder & Convert All...", command=self._batch_convert, style="Action.TButton")
        btn_batch_run.pack(side=tk.LEFT, padx=(0, 10))

        btn_sel_all = ttk.Button(batch_act_frame, text="Select All", command=self._batch_select_all)
        btn_sel_all.pack(side=tk.LEFT, padx=3)

        btn_sel_rc = ttk.Button(batch_act_frame, text="RaceChrono Only", command=self._batch_select_racechrono_only)
        btn_sel_rc.pack(side=tk.LEFT, padx=3)

        btn_clear_all = ttk.Button(batch_act_frame, text="Clear All", command=self._batch_clear_all)
        btn_clear_all.pack(side=tk.LEFT, padx=3)

        # Tab 3: Console & Logs
        tab_log = ttk.Frame(tab_control, padding=5)
        tab_control.add(tab_log, text=" Processing Log ")

        self.txt_log = tk.Text(tab_log, wrap=tk.WORD, font=("Consolas", 9), bg="#1e1e1e", fg="#d4d4d4", insertbackground="white")
        log_scroll = ttk.Scrollbar(tab_log, orient=tk.VERTICAL, command=self.txt_log.yview)
        self.txt_log.configure(yscroll=log_scroll.set)
        self.txt_log.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        log_scroll.pack(side=tk.RIGHT, fill=tk.Y)

        # Auto-load if default DDA file exists in folder
        default_dda = "Run045-192535-00.14.dda"
        if os.path.exists(default_dda):
            self.file_var.set(os.path.abspath(default_dda))
            self._parse_file()

    def _batch_select_all(self):
        self.batch_opt_rc_csv.set(True)
        self.batch_opt_rcz.set(True)
        self.batch_opt_csv.set(True)
        self.batch_opt_gpx.set(True)
        self.batch_opt_kml.set(True)

    def _batch_select_racechrono_only(self):
        self.batch_opt_rc_csv.set(True)
        self.batch_opt_rcz.set(True)
        self.batch_opt_csv.set(False)
        self.batch_opt_gpx.set(False)
        self.batch_opt_kml.set(False)

    def _batch_clear_all(self):
        self.batch_opt_rc_csv.set(False)
        self.batch_opt_rcz.set(False)
        self.batch_opt_csv.set(False)
        self.batch_opt_gpx.set(False)
        self.batch_opt_kml.set(False)

    def _browse_file(self):
        f = filedialog.askopenfilename(
            title="Select Ducati DDA Telemetry File",
            filetypes=[("Ducati DDA Files", "*.dda"), ("All Files", "*.*")]
        )
        if f:
            self.file_var.set(f)
            self._parse_file()

    def _log(self, msg):
        self.txt_log.insert(tk.END, msg + "\n")
        self.txt_log.see(tk.END)

    def _parse_file(self):
        fpath = self.file_var.get()
        if not fpath or not os.path.exists(fpath):
            messagebox.showerror("File Error", "Please select a valid .dda file.")
            return

        self.current_filepath = fpath
        self.txt_log.delete("1.0", tk.END)
        self._log(f"[*] Opening and analyzing DDA file: {fpath}")

        try:
            self.parser = DDAParser(fpath)
            count = self.parser.parse()
            self._log(f"[+] Successfully decoded {count:,} telemetry frames.\n")

            # Update Metadata display
            self.lbl_meta_track.config(text=f"Track: {self.parser.header.track_name or 'N/A'}")
            self.lbl_meta_rider.config(text=f"Rider: {self.parser.header.rider_name or 'N/A'}")
            self.lbl_meta_dur.config(text=f"Duration: {self.parser.stats.get('duration_min', 0):.2f} min ({self.parser.stats.get('duration_s', 0):.1f}s)")
            self.lbl_meta_gps_count.config(text=f"GPS Fixes: {self.parser.stats.get('gps_fixes', 0):,}")

            # Update Dynamics display
            max_spd_k = self.parser.stats.get('max_speed_kmh', 0)
            max_spd_m = self.parser.stats.get('max_speed_mph', 0)
            self.lbl_stat_speed.config(text=f"Max Speed: {max_spd_k:.1f} km/h ({max_spd_m:.1f} mph)")
            self.lbl_stat_rpm.config(text=f"Max RPM: {self.parser.stats.get('max_rpm', 0):,}")
            
            lean_l = self.parser.stats.get('max_lean_left_deg', 0)
            lean_r = self.parser.stats.get('max_lean_right_deg', 0)
            self.lbl_stat_lean.config(text=f"Max Lean: L {lean_l:.1f}° / R {lean_r:.1f}°")

            alt_min = self.parser.stats.get('min_alt_m', 0)
            alt_max = self.parser.stats.get('max_alt_m', 0)
            self.lbl_stat_alt.config(text=f"Elevation: {alt_min:.1f} m to {alt_max:.1f} m")

            # Populate Treeview with downsampled telemetry for fast UI rendering
            self.tree.delete(*self.tree.get_children())
            for r in self.records_sample(self.parser.records, max_rows=1500):
                lat_str = f"{r.gps_lat:.6f}" if r.gps_lat is not None else "--"
                lon_str = f"{r.gps_lon:.6f}" if r.gps_lon is not None else "--"
                alt_str = f"{r.gps_alt_m:.1f}" if r.gps_lat is not None else "--"
                self.tree.insert("", tk.END, values=(
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
                ))

            self._log("=" * 60)
            self._log("TELEMETRY SESSION OVERVIEW")
            self._log("=" * 60)
            self._log(f"Track Name     : {self.parser.header.track_name}")
            self._log(f"Rider Name     : {self.parser.header.rider_name}")
            self._log(f"Session Duration: {self.parser.stats.get('duration_s', 0):.1f} s ({self.parser.stats.get('duration_min', 0):.2f} min)")
            self._log(f"Total Frames   : {len(self.parser.records):,}")
            self._log(f"GPS Fixes      : {self.parser.stats.get('gps_fixes', 0):,}")
            self._log(f"Max Speed      : {max_spd_k:.1f} km/h ({max_spd_m:.1f} mph)")
            self._log(f"Max RPM        : {self.parser.stats.get('max_rpm', 0):,} RPM")
            self._log(f"Max Lean Angle : Left {lean_l:.1f}° / Right {lean_r:.1f}°")
            self._log(f"Max DTC Slow   : {self.parser.stats.get('max_dtc_slow_pct', 0)} %")
            self._log(f"Max DTC Fast   : {self.parser.stats.get('max_dtc_fast_pct', 0)} %")
            self._log("=" * 60)

        except Exception as e:
            self._log(f"[-] Error loading file: {e}")
            messagebox.showerror("Parsing Error", f"Failed to decode DDA file:\n{e}")

    def records_sample(self, records, max_rows=1500):
        """Evenly downsamples records for smooth UI rendering."""
        if len(records) <= max_rows:
            return records
        step = max(1, len(records) // max_rows)
        return records[::step]

    def _export(self, fmt):
        if not self.parser or not self.parser.records:
            messagebox.showwarning("No Data", "Please load and decode a valid .dda file first.")
            return

        base_name = os.path.splitext(os.path.basename(self.current_filepath))[0]
        ext_map = {
            "csv": ".csv",
            "gpx": ".gpx",
            "kml": ".kml",
            "racechrono_csv": "_racechrono_v3.csv",
            "racechrono_rcz": ".rcz"
        }
        default_ext = ext_map.get(fmt, ".csv")

        out_f = filedialog.asksaveasfilename(
            initialfile=f"{base_name}{default_ext}",
            defaultextension=default_ext,
            filetypes=[(f"{fmt.upper()} File", f"*{default_ext}"), ("All Files", "*.*")]
        )
        if not out_f:
            return

        try:
            if fmt == "csv":
                self.parser.export_csv(out_f)
            elif fmt == "gpx":
                self.parser.export_gpx(out_f)
            elif fmt == "kml":
                self.parser.export_kml(out_f)
            elif fmt == "racechrono_csv":
                self.parser.export_racechrono_csv(out_f)
            elif fmt == "racechrono_rcz":
                self.parser.export_racechrono_rcz(out_f)

            self._log(f"[+] Exported {fmt.upper()} successfully to: {out_f}")
            messagebox.showinfo("Export Success", f"Successfully exported file to:\n{out_f}")
        except Exception as e:
            self._log(f"[-] Export failed: {e}")
            messagebox.showerror("Export Failed", str(e))

    def _batch_convert(self):
        # Check active formats
        do_rc_csv = self.batch_opt_rc_csv.get()
        do_rcz = self.batch_opt_rcz.get()
        do_csv = self.batch_opt_csv.get()
        do_gpx = self.batch_opt_gpx.get()
        do_kml = self.batch_opt_kml.get()

        if not (do_rc_csv or do_rcz or do_csv or do_gpx or do_kml):
            messagebox.showwarning("No Formats Selected", "Please select at least one output format checkbox before batch converting.")
            return

        folder = filedialog.askdirectory(title="Select Folder Containing .dda Files")
        if not folder:
            return

        dda_files = [os.path.join(folder, f) for f in os.listdir(folder) if f.lower().endswith(".dda")]
        if not dda_files:
            messagebox.showinfo("No Files", "No .dda files found in the selected folder.")
            return

        success_count = 0
        formats_desc = []
        if do_rc_csv: formats_desc.append("RaceChrono v3 CSV")
        if do_rcz: formats_desc.append("RaceChrono RCZ")
        if do_csv: formats_desc.append("Standard CSV")
        if do_gpx: formats_desc.append("GPX")
        if do_kml: formats_desc.append("KML")

        self._log(f"\n[*] Starting Batch Conversion of {len(dda_files)} files in: {folder}")
        self._log(f"    Selected Formats: {', '.join(formats_desc)}")
        
        for f in dda_files:
            try:
                p = DDAParser(f)
                p.parse()
                base = os.path.splitext(f)[0]
                
                if do_rc_csv:
                    p.export_racechrono_csv(base + "_racechrono_v3.csv")
                if do_rcz:
                    p.export_racechrono_rcz(base + ".rcz")
                if do_csv:
                    p.export_csv(base + ".csv")
                if do_gpx:
                    p.export_gpx(base + ".gpx")
                if do_kml:
                    p.export_kml(base + ".kml")

                self._log(f"  [+] Converted: {os.path.basename(f)}")
                success_count += 1
            except Exception as e:
                self._log(f"  [-] Error converting {os.path.basename(f)}: {e}")

        self._log(f"[+] Batch conversion finished: {success_count}/{len(dda_files)} files converted successfully.\n")
        messagebox.showinfo("Batch Complete", f"Successfully converted {success_count} of {len(dda_files)} files to selected formats:\n({', '.join(formats_desc)})")


def cli_main():
    arg_parser = argparse.ArgumentParser(description="Ducati DDA Telemetry Decoder & Exporter")
    arg_parser.add_argument("file", nargs="?", help="Path to .dda file")
    arg_parser.add_argument("--csv", action="store_true", help="Export standard CSV")
    arg_parser.add_argument("--racechrono", action="store_true", help="Export RaceChrono v3 CSV")
    arg_parser.add_argument("--rcz", action="store_true", help="Export RaceChrono native .rcz archive")
    arg_parser.add_argument("--gpx", action="store_true", help="Export GPX 1.1")
    arg_parser.add_argument("--kml", action="store_true", help="Export Google Earth 3D KML")
    arg_parser.add_argument("--out-csv", help="Explicit output path for CSV export")
    arg_parser.add_argument("--out-racechrono", help="Explicit output path for RaceChrono v3 CSV export")
    arg_parser.add_argument("--out-rcz", help="Explicit output path for RaceChrono RCZ export")
    arg_parser.add_argument("--out-gpx", help="Explicit output path for GPX export")
    arg_parser.add_argument("--out-kml", help="Explicit output path for KML export")
    arg_parser.add_argument("--formats", help="Comma-separated format list for batch conversion (e.g. 'racechrono,rcz,csv' or 'all')")
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

        # Determine requested formats
        req_formats = set()
        if args.formats:
            fmt_tokens = [t.strip().lower() for t in args.formats.split(",")]
            if "all" in fmt_tokens:
                req_formats = {"racechrono", "rcz", "csv", "gpx", "kml"}
            else:
                for t in fmt_tokens:
                    if t in ("racechrono", "rc", "rc_csv", "racechrono_csv"): req_formats.add("racechrono")
                    elif t in ("rcz", "racechrono_rcz"): req_formats.add("rcz")
                    elif t in ("csv", "std_csv"): req_formats.add("csv")
                    elif t in ("gpx",): req_formats.add("gpx")
                    elif t in ("kml",): req_formats.add("kml")
        
        if args.racechrono: req_formats.add("racechrono")
        if args.rcz: req_formats.add("rcz")
        if args.csv: req_formats.add("csv")
        if args.gpx: req_formats.add("gpx")
        if args.kml: req_formats.add("kml")

        # Default formats if none explicitly specified
        if not req_formats:
            req_formats = {"racechrono", "rcz", "csv"}

        print(f"Found {len(files)} .dda files in {folder}.")
        print(f"Selected Output Formats: {', '.join(sorted(req_formats))}")
        print("Starting batch conversion...")

        for f in files:
            try:
                p = DDAParser(f)
                p.parse()
                base = os.path.splitext(f)[0]
                if "racechrono" in req_formats:
                    p.export_racechrono_csv(base + "_racechrono_v3.csv")
                if "rcz" in req_formats:
                    p.export_racechrono_rcz(base + ".rcz")
                if "csv" in req_formats:
                    p.export_csv(base + ".csv")
                if "gpx" in req_formats:
                    p.export_gpx(base + ".gpx")
                if "kml" in req_formats:
                    p.export_kml(base + ".kml")
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
        print(f"    Max RPM: {p.stats.get('max_rpm', 0):,} RPM | Max Lean: L {p.stats.get('max_lean_left_deg', 0):.1f} deg / R {p.stats.get('max_lean_right_deg', 0):.1f} deg")
        print(f"    GPS Fixes: {p.stats.get('gps_fixes', 0):,}")

        base = os.path.splitext(args.file)[0]
        has_specific_out = (args.out_csv or args.out_racechrono or args.out_rcz or args.out_gpx or args.out_kml)
        has_flag = (args.csv or args.racechrono or args.rcz or args.gpx or args.kml)

        if args.out_csv or (args.csv and not has_specific_out):
            out_p = args.out_csv or (base + ".csv")
            p.export_csv(out_p)
            print(f"  [+] Saved CSV: {out_p}")

        if args.out_racechrono or (args.racechrono and not has_specific_out):
            out_p = args.out_racechrono or (base + "_racechrono_v3.csv")
            p.export_racechrono_csv(out_p)
            print(f"  [+] Saved RaceChrono v3 CSV: {out_p}")

        if args.out_rcz or (args.rcz and not has_specific_out):
            out_p = args.out_rcz or (base + ".rcz")
            p.export_racechrono_rcz(out_p)
            print(f"  [+] Saved RaceChrono Native RCZ: {out_p}")

        if args.out_gpx or (args.gpx and not has_specific_out):
            out_p = args.out_gpx or (base + ".gpx")
            p.export_gpx(out_p)
            print(f"  [+] Saved GPX: {out_p}")

        if args.out_kml or (args.kml and not has_specific_out):
            out_p = args.out_kml or (base + ".kml")
            p.export_kml(out_p)
            print(f"  [+] Saved KML: {out_p}")

        if not (has_specific_out or has_flag):
            p.export_racechrono_csv(base + "_racechrono_v3.csv")
            p.export_racechrono_rcz(base + ".rcz")
            p.export_csv(base + ".csv")
            p.export_gpx(base + ".gpx")
            p.export_kml(base + ".kml")
            print(f"  [+] Generated default export suite (_racechrono_v3.csv, .rcz, .csv, .gpx, .kml)")
        return

    # Otherwise launch GUI
    app = DDAConverterApp()
    app.mainloop()


if __name__ == "__main__":
    cli_main()