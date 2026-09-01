# 🏍️ Ducati Data Analyzer (DDA) Reader & Visualizer Pro

A high-performance reverse-engineering suite, hardware downloader, telemetry converter, and interactive 60 FPS visualizer for **Ducati Data Analyzer (`.dda`)** files.

Compatible with all Ducati models equipped with DDA and DDA+ GPS systems (Panigale V4/V2, 1199/1299/899/959, Streetfighter V4/V2, SuperSport 939/950, Monster, Hypermotard, Multistrada, and SBK 1098/1198).

---

## 📦 Pre-Built Executables & Quick Download

Standalone binaries and application bundles are included directly in this repository:

| Platform | Download / Location | How to Run |
| :--- | :--- | :--- |
| 🍏 **macOS** | [**`dist/Ducati_DDA_Reader_macOS.zip`**](dist/Ducati_DDA_Reader_macOS.zip) | Download & unzip, then double-click **`Ducati DDA Reader.app`** (or execute `./launch_mac.command`). |
| 🪟 **Windows** | [**`dist/Ducati DDA Reader.exe`**](dist/) *(or build via `python build_executables.py`)* | Double-click **`Ducati DDA Reader.exe`**. |
| 🐍 **Python Source** | All Platforms | Run `pip install -r requirements.txt` then `python dda_converter_gui.py`. |

---

## ✨ Features at a Glance

* 🔌 **Direct USB Hardware Extraction**: Download recorded sessions directly from physical DDA USB sticks over WinUSB/libusb without proprietary OEM software.
* 📦 **100% Standalone Binary Parser**: Dissects raw `.dda` binary containers, decodes 100 Hz Engine CAN packets and 10 Hz GPS subframes, and synchronizes clocks with sub-millisecond accuracy.
* 📊 **Universal Export Suite**: One-click export to:
  * **RaceChrono** native package (`.rcz`) and CSV (`.csv`) for mobile analysis.
  * **GPS Exchange Formats** (`.gpx`, `.kml`) for Google Earth & mapping software.
  * **Portable HTML Visualizer** (`*_viewer.html`) with fully self-contained telemetry.
  * **Raw Data** (`.json`, standard `.csv`).
* 🏎️ **Interactive 60 FPS Web Visualizer**:
  * Synchronized GPS satellite track map with animated motorcycle marker and heatmaps (Speed, Lean Angle, Throttle, Gear, Braking).
  * Multi-channel telemetry waveform charts with scrubbers, zoom, and turn markers.
  * Interactive Timing Gate Editor: Create, drag, rotate, and auto-detect Start/Finish & Sector Split lines.
  * Dual-Lap Comparison Mode with synchronized delta metrics ($\Delta t$, $\Delta v$, $\Delta \text{TPS}$) and racing line deltas.
* 🎬 **Authentic MotoGP TV Broadcast Lap Timer Overlay & Video Exporter**:
  * Broadcast-style floating card with live lap time, 3-sector progressive delta indicators (🔴 Red / 🟠 Orange / ⚪ Grey), and 5-second sector split freeze pops.
  * Animated **FASTEST LAP** wipe & pan celebration banners.
  * **Dual-Channel Alpha / Luma Matte Video Pipeline**: Export transparent overlays (WebM / MP4) with mathematically exact grayscale alpha mattes for 100% halo-free compositing in **DaVinci Resolve** and **Adobe Premiere Pro**.

---

## 🚀 Quick Start

### 1. Launching the Application

#### Option A: Native Executable / App Bundle
* **macOS**: Extract `dist/Ducati_DDA_Reader_macOS.zip` and double-click `Ducati DDA Reader.app` (or run `./launch_mac.command`).
* **Windows**: Run `dist/Ducati DDA Reader.exe`.

#### Option B: From Source (Python 3.9+)
```bash
# 1. Clone the repository
git clone https://github.com/mfisch707/DDA_Reader.git
cd DDA_Reader

# 2. Install dependencies
pip install -r requirements.txt

# 3. Launch the Converter & Downloader GUI
python dda_converter_gui.py
```

---

## 🖥️ User Guide: Desktop Application

The desktop GUI (`dda_converter_gui.py`) provides an all-in-one hub for downloading from hardware, converting `.dda` files, and launching the visualizer.

```
+-------------------------------------------------------------------------+
|  🏍️ DUCATI DATA ANALYZER (DDA) PRO                                      |
|  [📂 Open .dda File]   [🔌 Download from DDA Stick]   [🚀 Launch Viewer] |
+-------------------------------------------------------------------------+
|  SESSION SUMMARY                                                        |
|  - Track: Sonoma Raceway              - Duration: 18m 21s (11,010 frames)|
|  - Rider: Ducati Rider                - Max Speed: 183.6 km/h (114.1 mph)|
|  - Max RPM: 12,243 RPM                - Max Lean: L 43.0° / R 45.3°     |
+-------------------------------------------------------------------------+
|  EXPORT ACTIONS                                                         |
|  [📊 Standalone HTML Viewer]    [🏁 RaceChrono .RCZ]   [📄 Standard CSV] |
|  [🌍 Google Earth .KML]         [🗺️ GPS Exchange .GPX] [💾 Raw JSON]    |
+-------------------------------------------------------------------------+
```

### 1. Opening and Converting `.dda` Files
1. Click **`📂 Open .dda File`** and select any native `.dda` session file.
2. The summary panel will display session metadata, channel counts, max speed, RPM, and lean angle statistics.
3. Click any export button (e.g. **`📊 Open in Interactive HTML Viewer`** or **`🏁 Export to RaceChrono .RCZ`**).

### 2. Direct USB Hardware Downloader
1. Plug your DDA / DDA+ GPS stick into a USB port.
2. Click **`🔌 Download from DDA Stick`** in the GUI (or run `python dda_device.py` in your terminal).
3. The downloader will scan USB buses, connect in safe read-only mode, and list all recorded runs on the stick with timestamp and file size.
4. Select runs to download and specify the destination folder.
5. Once extraction completes, click **Yes** on the prompt to decode and open the session immediately.

---

## 🌐 User Guide: Interactive Web Visualizer

The standalone Web Visualizer (`viewer/index.html` or generated `*_viewer.html`) is a self-contained single-page dashboard.

```
+-----------------------------------------------------------------------------------+
| 🏍️ DUCATI DDA PRO   Sonoma Raceway | Ducati Rider | 18:21.0        [Compare] [⚙️]  |
+-----------------------------------+-----------------------------------------------+
|  GPS TRACK MAP (Satellite/Dark)   |  COCKPIT GAUGES & METRICS                     |
|                                   |  - Digital Speedometer (MPH / KM/H)           |
|  - Heatmap Overlay (Speed, Lean,  |  - Bar Tachometer & RPM Shift Lights          |
|    Throttle, Braking)             |  - Lean Angle Gauge (Left / Right °)          |
|  - Interactive Timing Gates       |  - Throttle Position (TPS %) & DTC Cuts       |
|  - Turn Marker Flags & Apexes     +-----------------------------------------------+
|                                   |  AUTHENTIC MOTOGP HUD OVERLAY                 |
|                                   |  [ 14 ] DUCATI RIDER | Panigale V4 R          |
|                                   |  01:21.147   Δ -0.071 🔴                      |
|                                   |  [S1: 🔴] [S2: 🟠] [S3: ⚪]                   |
+-----------------------------------+-----------------------------------------------+
|  TELEMETRY WAVEFORM CHARTS                                                        |
|  - Speed (Wheel & GPS) | RPM | TPS % | Lean Angle ° | Gear | G-Force | Δ-Time     |
|  [▶ Play / Pause] [⏪ Prev Lap] [⏩ Next Lap] [1.0x] [Scrubber Slider]             |
+-----------------------------------------------------------------------------------+
```

### Key Visualizer Features

1. **Synchronized Playback**:
   * Use the transport bar at the bottom to play, pause, seek, or change playback speed ($0.5\times, 1.0\times, 2.0\times, 5.0\times$).
   * Click anywhere on the map or telemetry charts to jump the playback head immediately to that point on track.
2. **GPS Map & Heatmaps**:
   * Switch between **Dark Mode**, **Satellite Imagery**, and **Street View**.
   * Colorize the GPS line by **Speed**, **Lean Angle**, **Throttle (TPS %)**, **Engine RPM**, **Gear**, or **Braking Zone Intensity**.
3. **Interactive Timing Gates & Track Profiles**:
   * Click **`🚩 Edit Gates`** to reposition Start/Finish and Sector Split lines directly on the satellite map.
   * Rotate gates with precision angle controls ($\pm 10^\circ, 180^\circ$ flip) to match track orientation.
   * Auto-detects Sonoma Raceway, Laguna Seca, and Thunderhill Raceway, or allows custom circuit creation.
4. **Dual-Lap Comparison Mode**:
   * Click **`⚡ Compare`** in the header.
   * Select **Lap A** and **Lap B** to overlay GPS racing lines and synchronized waveform traces.
   * Inspect instant time delta ($\Delta t$), speed delta ($\Delta v$), and throttle delta ($\Delta \text{TPS}$) pills.
5. **Keyboard Shortcuts**:
   * <kbd>Space</kbd>: Play / Pause playback
   * <kbd>←</kbd> / <kbd>→</kbd>: Step frame-by-frame
   * <kbd>↑</kbd> / <kbd>↓</kbd>: Jump to Previous / Next Lap
   * <kbd>C</kbd>: Toggle Dual-Lap Compare Mode
   * <kbd>M</kbd>: Maximize / Restore Map Viewport
   * <kbd>T</kbd>: Maximize / Restore Telemetry Charts

---

## 🎬 MotoGP Broadcast HUD & Video Overlay Exporter

Export television-quality telemetry overlays to composite onto on-board GoPro or Insta360 track footage.

### Overlay Features
* **Dynamic Header**: Customizable rider name, bike model, racing number badge, and tire compound indicators (Front/Rear).
* **Live Running Timer**: Real-time lap timer with millisecond precision.
* **Sector Split Pops**: Holds sector split times for 5 seconds when crossing timing lines with dynamic delta enlargement.
* **Fastest Lap Celebration**: Authentic MotoGP TV broadcast slider animation when a session benchmark is achieved.

### Exporting & Video Editing Workflow

1. In the Web Visualizer, click **`🎬 Video Overlay`** in the sidebar.
2. Customize Rider Name, Motorcycle, Number, and Tire Compounds.
3. Select your output format:
   * **Dual-Channel Alpha / Luma Matte (Recommended for DaVinci Resolve & Premiere Pro)**: Exports synchronized Color and Grayscale Alpha videos for flawless, zero-halo compositing.
   * **Transparent WebM (VP9 with Alpha)**: Single-file transparent video.
   * **Green Screen / Chroma Key**: Solid background for quick testing.
4. Click **`Start Rendering Overlay`**.

#### Compositing in DaVinci Resolve
1. Place your on-board race camera footage on **Track 1**.
2. Place the **Color Video** on **Track 2**.
3. Place the **Matte Video** on **Track 3**.
4. In the **Color Page**, right-click the node editor, select **Add Matte**, and link the matte output to the Color clip's alpha channel.

---

## 🔌 Hardware Compatibility & Drivers

| Hardware Generation | Motorcycles Supported | GPS Integration | Protocol Status |
| :--- | :--- | :---: | :---: |
| **DDA+ GPS (1714 / V4)** | Panigale V4 / V4S / V4R / SP2, Streetfighter V4, Panigale V2 | ✅ 10 Hz GPS Fixes | **Full Direct Support** |
| **DDA+ GPS (1199 / 1299)** | Panigale 1199 / 1299 / 899 / 959, SuperSport 939 / 950 | ✅ 10 Hz GPS Fixes | **Full Direct Support** |
| **DDA Evo** | Monster 1200 / 821, Hypermotard 939 / 950, Multistrada 1200 / 1260 | Optional | **Full Direct Support** |
| **DDA Classic** | SBK 1098 / 1198 / 848, Desmosedici RR, Streetfighter 1098 | ❌ CAN Telemetry Only | **Full Direct Support** |

### Driver Setup
* **Windows**: Communicates directly via `winusb.dll`. If Windows does not automatically assign a driver to the stick, use the INF driver provided in `driver/` or use [Zadig](https://zadig.akeo.ie/) to assign WinUSB to device `VID: 0x1781, PID: 0x0B7B`.
* **macOS & Linux**: Automatically supported via `libusb-package` and `pyusb`.

---

## 🛠️ Building Native Executables

To build standalone binary packages for your operating system:

```bash
# Build native executable / app bundle
python build_executables.py
```

* **macOS**: Generates `dist/Ducati DDA Reader.app` and `dist/Ducati_DDA_Reader_macOS.zip`.
* **Windows**: Generates `dist/Ducati DDA Reader.exe`.
* **Linux**: Generates `dist/Ducati DDA Reader`.

---

## 📁 Repository Structure

```
DDA_Reader/
├── dda_converter_gui.py      # PyQt6 Desktop GUI Application
├── dda_core.py               # Core binary parser, math engine & exporter
├── dda_device.py             # USB hardware downloader engine (CLI & API)
├── dda_settings.json         # User preferences and default track databases
├── build_executables.py      # PyInstaller cross-platform bundler script
├── launch_mac.command        # macOS 1-click launcher script
├── sample_run.dda            # Sample anonymized native DDA binary session
├── sample_run.json           # Sample decoded telemetry dataset
├── sample_run_viewer.html    # Standalone bundled web visualizer
├── requirements.txt          # Python package requirements
├── driver/                   # WinUSB driver INF for Windows setup
└── viewer/                   # Web Visualizer Frontend
    ├── index.html            # Dashboard layout and MotoGP overlay templates
    ├── style.css             # Dark theme styling & responsive grid system
    ├── app.js                # Core UI coordinator & event listeners
    └── js/
        ├── state.js          # Reactive state store & geometry utilities
        ├── parser.js         # Client-side JSON & DDA file decoders
        ├── map.js            # Leaflet GPS map engine & heatmap layers
        ├── charts.js         # Canvas telemetry waveform rendering engine
        ├── gates.js          # Sector line vectors & crossing detection
        ├── motogp_card.js    # MotoGP timing HUD card logic & animations
        ├── video_export.js   # WebCodecs canvas video exporter & alpha pipeline
        └── video_player.js   # Synchronized video player integration
```

---

## 📄 License

Open-source under the MIT License. Developed for motorcycle track-day enthusiasts, racers, and telemetry engineers.
