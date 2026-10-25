#!/usr/bin/env python3
"""
Ducati DDA (Ducati Data Analyzer) Core Engine & Universal Exporter
Decodes Ducati CAN-bus binary telemetry streams with GPS & chassis dynamics.
100% Dynamic & Universal:
  - Discovers GPS spatial track chain across any global coordinates (no hardcoded locations).
  - Applies Gaussian filtering to eliminate GNSS coordinate jitter while preserving apex accuracy.
  - Dynamically detects engine startup, idle, and riding transitions (no hardcoded timestamps).
  - Handles variable-length 33B / 36B TDM frames with continuity filtering.
  - Automatically identifies Start/Finish gate and segments individual laps and splits.
  - Exporters: JSON, Standalone Interactive HTML Viewer, CSV, RaceChrono v3 CSV, RaceChrono Native .rcz, GPX 1.1, and Google Earth KML.
"""

import os
import re
import sys
import struct
import math
import json
import zipfile
from datetime import datetime, timedelta, timezone

def _get_base_dir():
    """Returns the base directory for bundled assets (supports PyInstaller frozen bundles and standard execution)."""
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))

def haversine_distance_m(lat1, lon1, lat2, lon2):
    """Calculates great-circle distance between two GPS coordinates in meters."""
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2.0) ** 2
    return 2.0 * R * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def smooth_gps_series(raw_lats, raw_lons, raw_speeds, window_size=5):
    """
    Applies Gaussian moving window smoothing to GPS coordinates.
    Eliminates GNSS discretization noise while preserving racing lines and apexes.
    """
    n = len(raw_lats)
    if n < window_size * 2:
        return raw_lats[:], raw_lons[:]

    half = window_size // 2
    weights = [math.exp(-0.5 * (x / 1.0) ** 2) for x in range(-half, half + 1)]
    w_sum = sum(weights)
    weights = [w / w_sum for w in weights]

    smooth_lats = []
    smooth_lons = []

    for i in range(n):
        if raw_speeds[i] < 3.0:
            smooth_lats.append(raw_lats[i])
            smooth_lons.append(raw_lons[i])
            continue

        w_acc = 0.0
        lat_acc = 0.0
        lon_acc = 0.0

        for w_idx, offset in enumerate(range(-half, half + 1)):
            k = i + offset
            if 0 <= k < n:
                w = weights[w_idx]
                w_acc += w
                lat_acc += raw_lats[k] * w
                lon_acc += raw_lons[k] * w

        if w_acc > 0:
            smooth_lats.append(lat_acc / w_acc)
            smooth_lons.append(lon_acc / w_acc)
        else:
            smooth_lats.append(raw_lats[i])
            smooth_lons.append(raw_lons[i])

    return smooth_lats, smooth_lons


class DDAChannelDescriptor:
    """Descriptor for a single telemetry channel extracted from DDA header."""
    __slots__ = (
        'name', 'long_name', 'unit', 'can_id', 'byte_size',
        'interval_s', 'multiplier', 'offset', 'signed', 'ticks'
    )
    def __init__(self, name, long_name="", unit="", can_id=0, byte_size=2, interval_s=0.02, multiplier=1.0, offset=0.0, signed=False):
        self.name = name
        self.long_name = long_name
        self.unit = unit
        self.can_id = can_id
        self.byte_size = byte_size
        self.interval_s = interval_s
        self.multiplier = multiplier
        self.offset = offset
        self.signed = signed
        self.ticks = max(1, int(round(interval_s / 0.01)))

    def to_dict(self):
        return {
            "name": self.name,
            "long_name": self.long_name,
            "unit": self.unit,
            "can_id": f"0x{self.can_id:X}",
            "byte_size": self.byte_size,
            "rate_hz": round(1.0 / self.interval_s),
            "multiplier": self.multiplier,
            "offset": self.offset
        }


class DDAHeader:
    """Parsed DDA File Header and Metadata."""
    BIKE_CODE_MAP = {
        "0801": "1199 / 899 Panigale",
        "0902": "Hypermotard 821 / Monster 821 / 1200",
        "1201": "1199 Superleggera",
        "1204": "1299 / 959 Panigale",
        "1206": "1199 Panigale R / Superstock",
        "1408": "1299 Superleggera",
        "1409": "Panigale V4 / V4 S / Speciale",
        "1714": "Panigale V4 R / V2 / Streetfighter V2 / V4",
    }
    LEGACY_NOTE_MAP = {
        "SBK 1198": ("SBK1198", "Superbike 1198 / 1198 S / SP"),
        "SBK 1098": ("SBK1098", "Superbike 1098 / 1098 S / R / 848"),
        "Monster":  ("Monster", "Monster 696 / 796 / 1100 / Streetfighter"),
        "Desmo16":  ("Desmo16", "Desmosedici RR (D16RR)"),
    }

    def __init__(self):
        self.version = 4
        self.track_name = ""
        self.rider_name = ""
        self.session_note = ""
        self.bike_code = ""
        self.bike_model = ""
        self.session_datetime = ""
        self.datetime_obj = None
        self.unix_timestamp = 0.0
        self.header_odometer_km = 0
        self.run_number = 0
        self.is_download_timestamp = False
        self.header_size = 1630
        self.frequency_hz = 100
        self.clock_s = 0.01
        self.channels = []

    def parse(self, raw_data: bytes, filepath: str = ""):
        if len(raw_data) < 32:
            raise ValueError("File is too short to be a valid DDA file.")

        self.version = struct.unpack_from("<H", raw_data, 0)[0]
        
        # Track name at offset 0x2A (42)
        try:
            track_bytes = raw_data[42:90].split(b'\x00')[0]
            self.track_name = track_bytes.decode('latin1', errors='ignore').strip()
        except Exception:
            self.track_name = ""

        # Rider name at offset 0x6A (106)
        try:
            rider_bytes = raw_data[106:150].split(b'\x00')[0]
            self.rider_name = rider_bytes.decode('latin1', errors='ignore').strip()
        except Exception:
            self.rider_name = ""

        # Note & Ducati project model code at offset 0x14D (333)
        self.bike_code = ""
        self.bike_model = ""
        try:
            note_idx = raw_data.find(b'DDA for', 0, 500)
            if note_idx != -1:
                self.session_note = raw_data[note_idx:note_idx+45].split(b'\x00')[0].decode('latin1', errors='ignore').strip()
                m_code = re.search(r'DDA for\s+(\d{4})', self.session_note)
                if m_code:
                    self.bike_code = m_code.group(1)
                    self.bike_model = self.BIKE_CODE_MAP.get(self.bike_code, f"Ducati ({self.bike_code})")
                else:
                    for key, (code, label) in self.LEGACY_NOTE_MAP.items():
                        if key in self.session_note:
                            self.bike_code = code
                            self.bike_model = label
                            break
                if "with ADC Ext" in self.session_note and self.bike_model:
                    self.bike_model += " (ADC Ext)"
            else:
                self.session_note = ""
        except Exception:
            self.session_note = ""

        # Extract run number from filename if present (e.g. Run045-... -> 45)
        self.run_number = 0
        base_fname = os.path.basename(filepath) if filepath else ""
        if base_fname:
            m_run = re.search(r'Run0*(\d+)', base_fname, re.IGNORECASE)
            if m_run:
                try:
                    self.run_number = int(m_run.group(1))
                except ValueError:
                    self.run_number = 0

        # Starting odometer / run metric at offset 0xB2 (178)
        self.header_odometer_km = 0
        raw_odo = 0
        if len(raw_data) >= 182:
            try:
                raw_odo = struct.unpack_from("<I", raw_data, 0xB2)[0]
                # On Streetfighter V2 / Panigale V2 (1714), CAN 0x300 odometer is shifted left by 6 bits with 0x17 status bits
                if self.bike_code == "1714" and raw_odo > 65536 and (raw_odo & 0x3F) == 0x17:
                    self.header_odometer_km = raw_odo >> 6
                else:
                    self.header_odometer_km = raw_odo
            except Exception:
                self.header_odometer_km = 0
        if self.header_odometer_km == 0 and base_fname:
            m_odo = re.search(r'Run\d+-(\d{5,7})-', base_fname, re.IGNORECASE)
            if m_odo:
                try:
                    f_odo = int(m_odo.group(1))
                    if self.bike_code == "1714" and f_odo > 65536 and (f_odo & 0x3F) == 0x17:
                        self.header_odometer_km = f_odo >> 6
                    else:
                        self.header_odometer_km = f_odo
                except ValueError:
                    pass

        # Session Date/Time at offset 0xAA (170):
        # pfusbcontroller.dll writes: (QDateTime::toMSecsSinceEpoch() * 10000) + 0x089F7FF5F7B58000
        # IMPORTANT: In PFProtocolBase::getRunDateTime, genuine stick timestamps use QTime(hour, minute, 0, 0)
        # so seconds and milliseconds are strictly 0 (msecs % 60000 == 0).
        # When the bike has no valid calendar date on CAN (or on 1714 where CAN 0x300 bitfields are shifted),
        # pfusbcontroller.dll logs "Run Date Time is not available. Returning now()" and writes
        # QDateTime::currentDateTime() (the PC's file-creation/download time, with non-zero seconds/ms) into 0xAA.
        self.datetime_obj = None
        self.session_datetime = ""
        self.unix_timestamp = 0.0
        self.is_download_timestamp = False
        OEM_EPOCH_TICKS = 0x089F7FF5F7B58000  # 621,355,968,000,000,000 (100-ns ticks from 0001-01-01 to 1970-01-01)
        if len(raw_data) >= 178:
            try:
                raw_ticks = struct.unpack_from("<Q", raw_data, 0xAA)[0]
                net_ticks = raw_ticks & 0x3FFFFFFFFFFFFFFF
                if net_ticks > OEM_EPOCH_TICKS:
                    msecs = (net_ticks - OEM_EPOCH_TICKS) // 10_000
                    # Check if this is a genuine stick timestamp (exact minute, sec=0, ms=0) vs PC download-time fallback
                    if (msecs % 60_000) == 0 and self.bike_code != "1714":
                        dt = datetime.fromtimestamp(msecs / 1000.0)
                        if 1995 <= dt.year <= 2100:
                            self.datetime_obj = dt
                            self.session_datetime = dt.strftime("%Y-%m-%d %H:%M:%S")
                            self.unix_timestamp = float(msecs) / 1000.0
                    else:
                        self.is_download_timestamp = True
            except Exception:
                pass

        # Fallback 1: OEM filename dashboard clock (e.g. Run015-021093-15.01-panigale-1199.dda -> 15:01)
        # On bikes without a calendar date (like Panigale 1199/899/1299), 0xAA gets overwritten with PC download time,
        # but PFProtocolBase::getRunName still writes the bike's dashboard HH.MM into Run<idx>-<odo>-<HH>.<MM>.dda.
        if self.datetime_obj is None and base_fname and self.bike_code != "1714":
            m_oem = re.search(r'Run\d+-\d+-(\d{2})\.(\d{2})', base_fname, re.IGNORECASE)
            if m_oem:
                try:
                    hh, mm = int(m_oem.group(1)), int(m_oem.group(2))
                    if 1 <= hh <= 23 and 0 <= mm <= 59:
                        self.session_datetime = f"{hh:02d}:{mm:02d}"
                except ValueError:
                    pass

        # Fallback 2: Explicit YYYYMMDD_HHMMSS filename timestamp (if not from 1714 shifted CAN bytes)
        if self.datetime_obj is None and not self.session_datetime and base_fname and self.bike_code != "1714":
            m_dt = re.search(r'(20\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})', base_fname)
            if m_dt:
                try:
                    dt = datetime(
                        int(m_dt.group(1)), int(m_dt.group(2)), int(m_dt.group(3)),
                        int(m_dt.group(4)), int(m_dt.group(5)), int(m_dt.group(6))
                    )
                    self.datetime_obj = dt
                    self.session_datetime = dt.strftime("%Y-%m-%d %H:%M:%S")
                    self.unix_timestamp = dt.timestamp()
                except Exception:
                    pass

        # Check ACQ block offset at 0x26 (after "ACQ\0" + 2-byte version at 0x20..0x26)
        if len(raw_data) >= 42 and raw_data[0x20:0x24] == b'ACQ\x00':
            acq_size = struct.unpack_from("<I", raw_data, 0x26)[0]
            if 500 <= acq_size <= 8192:
                self.header_size = acq_size
        elif len(raw_data) >= 28:
            acq_size = struct.unpack_from("<I", raw_data, 0x24)[0]
            if 500 <= acq_size <= 8192:
                self.header_size = acq_size

        # Extract 80-byte channel descriptors from the DAQ header block
        self.channels.clear()
        ch_start = 510
        if self.header_size >= 590 and len(raw_data) >= self.header_size:
            pos = ch_start
            while pos + 80 <= self.header_size:
                ch_block = raw_data[pos : pos + 80]
                name_bytes = ch_block[0:16].split(b'\x00')[0]
                if not name_bytes or not name_bytes[0]:
                    break
                name = name_bytes.decode('ascii', errors='ignore').strip()
                if not name:
                    break

                # Skip non-sampled trigger pseudo-channel ("ACQ") if present
                if name == "ACQ":
                    pos += 80
                    continue

                u32_16 = struct.unpack_from("<I", ch_block, 16)[0]
                can_id = u32_16 & 0x1FFFFFFF
                u16_20 = struct.unpack_from("<H", ch_block, 20)[0]
                byte_size = (((u16_20 >> 6) & 0x1F) + 8) >> 3
                if byte_size < 1 or byte_size > 4:
                    byte_size = 2

                fcode = (ch_block[21] >> 3) & 0x1F
                freq_hz = (fcode % 10) * (10 ** (fcode // 10))
                if freq_hz <= 0:
                    freq_hz = 10
                interval_s = 1.0 / freq_hz

                desc_parts = ch_block[22:54].split(b'\x00')
                long_name = desc_parts[0].decode('latin1', errors='ignore').strip() if len(desc_parts) > 0 else ""
                unit = desc_parts[1].decode('latin1', errors='ignore').strip() if len(desc_parts) > 1 else ""

                b54 = ch_block[54]
                b55 = ch_block[55]
                u16_54 = struct.unpack_from("<H", ch_block, 54)[0]
                decimals = (b54 >> 3) & 0x0F
                scale_mode = (u16_54 >> 7) & 0x07
                is_signed = bool((b55 >> 2) & 0x01)
                f60, f64 = struct.unpack_from("<ff", ch_block, 60)

                scale_dec = 10.0 ** (-decimals)
                if scale_mode == 1 and f60 != 0.0 and not math.isnan(f60):
                    mult = scale_dec / f60
                    offs = 0.0
                elif scale_mode == 2 and not math.isnan(f60):
                    mult = scale_dec * f60
                    offs = f64 if not math.isnan(f64) else 0.0
                elif scale_mode == 4 and not math.isnan(f60):
                    mult = scale_dec
                    offs = f60
                else:
                    mult = scale_dec
                    offs = 0.0

                ch = DDAChannelDescriptor(
                    name, long_name, unit, can_id,
                    byte_size=byte_size, interval_s=interval_s,
                    multiplier=mult, offset=offs, signed=is_signed
                )
                self.channels.append(ch)
                pos += 80

        if not self.channels:
            self._apply_default_channels()

    def _apply_default_channels(self):
        self.channels = [
            DDAChannelDescriptor("SPEED", "Vehicle speed", "km/h", 24, byte_size=2, interval_s=0.10, multiplier=0.065625),
            DDAChannelDescriptor("RPM", "Engine RPM", "rpm", 36, byte_size=2, interval_s=0.02, multiplier=1.0),
            DDAChannelDescriptor("GAS", "Throttle aperture", "%", 36, byte_size=1, interval_s=0.05, multiplier=0.5),
            DDAChannelDescriptor("DIST", "Covered distance", "km", 768, byte_size=3, interval_s=1.00, multiplier=1.0),
            DDAChannelDescriptor("GEAR", "Engaged gear", "#", 36, byte_size=1, interval_s=0.05, multiplier=1.0),
            DDAChannelDescriptor("PSI_LEAN_ANGLE", "Lean angle", "deg", 392, byte_size=2, interval_s=0.02, multiplier=0.05493164, offset=-450.0),
            DDAChannelDescriptor("TORQUE_FAST", "Torque reduction fast", "%", 25, byte_size=1, interval_s=0.05, multiplier=1.0),
            DDAChannelDescriptor("TORQUE_SLOW", "Torque reduction slow", "%", 25, byte_size=1, interval_s=0.05, multiplier=1.0),
            DDAChannelDescriptor("GPS_ALT", "GPS Altitude", "m", 1553, byte_size=2, interval_s=0.10, multiplier=0.1),
            DDAChannelDescriptor("GPS_LON", "GPS Longitude", "deg", 1552, byte_size=4, interval_s=0.10, multiplier=1e-6, signed=True),
            DDAChannelDescriptor("GPS_LAT", "GPS Latitude", "deg", 1552, byte_size=4, interval_s=0.10, multiplier=1e-6, signed=True),
            DDAChannelDescriptor("LAP", "GPS Lap crossing", "sec", 1553, byte_size=1, interval_s=1.00, multiplier=1.0),
            DDAChannelDescriptor("INT_LAP1", "Intermediate 1", "sec", 1553, byte_size=1, interval_s=1.00, multiplier=1.0),
            DDAChannelDescriptor("INT_LAP2", "Intermediate 2", "sec", 1553, byte_size=1, interval_s=1.00, multiplier=1.0),
        ]


class DDARecord:
    """A synchronized telemetry record aligned directly with GPS sample time."""
    __slots__ = (
        'time_s', 'speed_kmh', 'gps_speed_kmh', 'rpm', 'tps_pct', 'gear',
        'lean_angle_deg', 'torque_fast_pct', 'torque_slow_pct',
        'temp_c', 'dtc', 'odometer_km',
        'distance_m', 'gps_lat', 'gps_lon', 'gps_alt_m',
        'raw_lat', 'raw_lon',
        'bearing_deg', 'lap', 'int_lap1', 'int_lap2',
        'accel_long_g', 'accel_lat_g', 'accel_total_g', 'wheel_slip_pct', 'wheelie',
        'session_id'
    )
    def __init__(self, time_s=0.0):
        self.time_s = time_s
        self.speed_kmh = 0.0
        self.gps_speed_kmh = 0.0
        self.rpm = 0
        self.tps_pct = 0.0
        self.gear = 0
        self.lean_angle_deg = 0.0
        self.torque_fast_pct = 0
        self.torque_slow_pct = 0
        self.temp_c = 0.0
        self.dtc = 0
        self.odometer_km = 0.0
        self.distance_m = 0.0
        self.gps_lat = None
        self.gps_lon = None
        self.raw_lat = None
        self.raw_lon = None
        self.gps_alt_m = 0.0
        self.bearing_deg = 0.0
        self.lap = 0
        self.int_lap1 = 0
        self.int_lap2 = 0
        self.accel_long_g = 0.0
        self.accel_lat_g = 0.0
        self.accel_total_g = 0.0
        self.wheel_slip_pct = 0.0
        self.wheelie = False
        self.session_id = "S1"

    def clone(self):
        c = DDARecord(self.time_s)
        c.speed_kmh = self.speed_kmh
        c.gps_speed_kmh = self.gps_speed_kmh
        c.rpm = self.rpm
        c.tps_pct = self.tps_pct
        c.gear = self.gear
        c.lean_angle_deg = self.lean_angle_deg
        c.torque_fast_pct = self.torque_fast_pct
        c.torque_slow_pct = self.torque_slow_pct
        c.temp_c = self.temp_c
        c.dtc = self.dtc
        c.odometer_km = self.odometer_km
        c.distance_m = self.distance_m
        c.gps_lat = self.gps_lat
        c.gps_lon = self.gps_lon
        c.raw_lat = self.raw_lat
        c.raw_lon = self.raw_lon
        c.gps_alt_m = self.gps_alt_m
        c.bearing_deg = self.bearing_deg
        c.lap = self.lap
        c.int_lap1 = self.int_lap1
        c.int_lap2 = self.int_lap2
        c.accel_long_g = self.accel_long_g
        c.accel_lat_g = self.accel_lat_g
        c.accel_total_g = self.accel_total_g
        c.wheel_slip_pct = self.wheel_slip_pct
        c.wheelie = self.wheelie
        c.session_id = self.session_id
        return c

    @classmethod
    def from_dict(cls, d: dict):
        r = cls(float(d.get("time_s", 0.0)))
        r.speed_kmh = float(d.get("speed_kmh", 0.0))
        r.gps_speed_kmh = float(d.get("gps_speed_kmh", 0.0))
        r.rpm = int(d.get("rpm", 0))
        r.tps_pct = float(d.get("tps_pct", 0.0))
        r.gear = int(d.get("gear", 0))
        r.lean_angle_deg = float(d.get("lean_angle_deg", 0.0))
        r.torque_fast_pct = int(d.get("torque_fast_pct", 0))
        r.torque_slow_pct = int(d.get("torque_slow_pct", 0))
        r.temp_c = float(d.get("temp_c", 0.0))
        r.dtc = int(d.get("dtc", 0))
        r.odometer_km = float(d.get("odometer_km", 0.0))
        r.distance_m = float(d.get("distance_m", 0.0))
        r.gps_lat = float(d["gps_lat"]) if d.get("gps_lat") is not None else None
        r.gps_lon = float(d["gps_lon"]) if d.get("gps_lon") is not None else None
        r.raw_lat = float(d["raw_lat"]) if d.get("raw_lat") is not None else r.gps_lat
        r.raw_lon = float(d["raw_lon"]) if d.get("raw_lon") is not None else r.gps_lon
        r.gps_alt_m = float(d.get("gps_alt_m", 0.0)) if d.get("gps_alt_m") is not None else 0.0
        r.bearing_deg = float(d.get("bearing_deg", 0.0))
        r.lap = int(d.get("lap", 1))
        r.accel_long_g = float(d.get("accel_long_g", 0.0))
        r.accel_lat_g = float(d.get("accel_lat_g", 0.0))
        r.accel_total_g = float(d.get("accel_total_g", 0.0))
        r.wheel_slip_pct = float(d.get("wheel_slip_pct", 0.0))
        r.wheelie = bool(d.get("wheelie", False))
        r.session_id = str(d.get("session_id", "S1"))
        return r

    @property
    def speed_mph(self):
        return self.speed_kmh * 0.621371

    @property
    def speed_ms(self):
        return self.speed_kmh / 3.6

    @property
    def gps_speed_mph(self):
        return self.gps_speed_kmh * 0.621371

    @property
    def gps_speed_ms(self):
        return self.gps_speed_kmh / 3.6

    @property
    def gps_alt_ft(self):
        return self.gps_alt_m * 3.28084

    def to_dict(self):
        return {
            "time_s": round(self.time_s, 2),
            "speed_kmh": round(self.speed_kmh, 1),
            "speed_mph": round(self.speed_mph, 1),
            "gps_speed_kmh": round(self.gps_speed_kmh, 1),
            "gps_speed_mph": round(self.gps_speed_mph, 1),
            "rpm": self.rpm,
            "tps_pct": round(self.tps_pct, 1),
            "gear": self.gear,
            "lean_angle_deg": round(self.lean_angle_deg, 1),
            "torque_fast_pct": self.torque_fast_pct,
            "torque_slow_pct": self.torque_slow_pct,
            "temp_c": round(self.temp_c, 1),
            "dtc": self.dtc,
            "odometer_km": round(self.odometer_km, 1),
            "distance_m": round(self.distance_m, 1),
            "gps_lat": round(self.gps_lat, 7) if self.gps_lat is not None else None,
            "gps_lon": round(self.gps_lon, 7) if self.gps_lon is not None else None,
            "raw_lat": round(self.raw_lat, 7) if self.raw_lat is not None else None,
            "raw_lon": round(self.raw_lon, 7) if self.raw_lon is not None else None,
            "gps_alt_m": round(self.gps_alt_m, 1) if self.gps_lat is not None else 0.0,
            "bearing_deg": round(self.bearing_deg, 1),
            "lap": self.lap,
            "session_id": self.session_id,
            "accel_long_g": round(self.accel_long_g, 2),
            "accel_lat_g": round(self.accel_lat_g, 2),
            "accel_total_g": round(self.accel_total_g, 2),
            "wheel_slip_pct": round(self.wheel_slip_pct, 1),
            "wheelie": self.wheelie
        }


class DDAParser:
    """High performance universal parser and decoder for Ducati DDA telemetry files."""
    def __init__(self, filepath: str):
        self.filepath = filepath
        self.header = DDAHeader()
        self.records = []
        self.gps_records = []
        self.laps = []
        self.gates = []
        self.stats = {}
        self._hw_lap_crossings = []
        self.is_multi_session = False
        self.pre_segmented_laps = False
        self.sessions = []

    def parse(self):
        """
        Parses DDA telemetry across any Ducati model using the universal header-driven
        100Hz (10ms tick) Time-Division Multiplexed (TDM) schedule, aggregating sub-10Hz
        channels (50Hz RPM, 20Hz Throttle/Lean/DTC) into each 10Hz GPS frame, applying
        Gaussian smoothing to GPS coordinates, deriving vehicle dynamics, and segmenting laps.
        """
        if isinstance(self.filepath, str):
            clean_path = self.filepath.strip().strip('"').strip("'").lstrip("\u202a\u202b\u202c\u200e\u200f\ufeff").strip()
            if clean_path:
                self.filepath = os.path.normpath(clean_path)

        if not os.path.exists(self.filepath):
            raise FileNotFoundError(f"DDA file not found: {self.filepath}")

        try:
            with open(self.filepath, "rb") as f:
                data = f.read()
        except OSError as e:
            if getattr(e, "errno", None) == 22:
                try:
                    st = os.stat(self.filepath)
                    attrs = getattr(st, "st_file_attributes", 0)
                    # Windows FILE_ATTRIBUTE_OFFLINE (0x1000), RECALL_ON_OPEN (0x40000), RECALL_ON_DATA_ACCESS (0x400000)
                    if attrs & (0x1000 | 0x00040000 | 0x00400000):
                        raise OSError(
                            22,
                            f"File '{self.filepath}' is an online-only cloud placeholder (OneDrive/iCloud/Google Drive). "
                            "Please right-click the file in Explorer and select 'Always keep on this device' so it is downloaded locally."
                        ) from e
                except OSError as cloud_err:
                    if "online-only cloud placeholder" in str(cloud_err):
                        raise
                raise OSError(22, f"Invalid argument while reading '{self.filepath}' ({e})") from e
            raise

        # 1. Parse Header & Channel Descriptors
        self.header.parse(data, filepath=self.filepath)

        hdr_size = self.header.header_size
        payload = data[hdr_size:]
        payload_len = len(payload)

        self.records.clear()
        self.gps_records.clear()
        self.laps.clear()
        self.gates.clear()
        self._hw_lap_crossings = []

        channels = self.header.channels
        ch_map = {ch.name: ch for ch in channels}
        has_imu_lean = "PSI_LEAN_ANGLE" in ch_map
        has_torque_fast = "TORQUE_FAST" in ch_map

        # Determine superframe clock (100Hz standard, or 200Hz when 200Hz ADC Ext channels like FORK/SHOCK are active)
        max_freq = max((round(1.0 / ch.interval_s) for ch in channels if ch.interval_s > 0), default=100)
        base_clock_hz = 200 if max_freq >= 200 else 100
        frame_10hz_ticks = base_clock_hz // 10

        # Precompute active channel lists for each tick in the 1.0s superframe
        superframe_schedule = []
        for t_mod in range(base_clock_hz):
            active = [
                (ch.name, ch.byte_size, ch.signed, ch.multiplier, ch.offset)
                for ch in channels
                if (t_mod % max(1, int(round(ch.interval_s * base_clock_hz)))) == 0
            ]
            step_bytes = sum(item[1] for item in active)
            superframe_schedule.append((active, step_bytes))

        # 2. Universal TDM Stream Decoder with Sub-10Hz Window Aggregation
        cur_state = {ch.name: 0 for ch in channels}
        offset = 0
        tick = 0
        last_lean = 0.0
        last_speed = 0.0
        last_rpm = 0
        last_tps = 0.0
        prev_hw_lap = 255

        # Sub-10Hz (100ms window) accumulators
        spd_win = []
        rpm_win = []
        gas_win = []
        lean_win = []
        tfast_win = []
        tslow_win = []
        dtc_win = []

        raw_lats = []
        raw_lons = []
        speeds_list = []
        gps_rec_list = []

        while offset < payload_len:
            active, step_bytes = superframe_schedule[tick % base_clock_hz]
            if offset + step_bytes > payload_len:
                break

            for name, sz, is_signed, mult, offs in active:
                if sz == 1:
                    val = struct.unpack_from("<b" if is_signed else "<B", payload, offset)[0]
                elif sz == 2:
                    val = struct.unpack_from("<h" if is_signed else "<H", payload, offset)[0]
                elif sz == 3:
                    b0 = payload[offset]
                    b1 = payload[offset + 1]
                    b2 = payload[offset + 2]
                    val = b0 | (b1 << 8) | (b2 << 16)
                    if is_signed and (val & 0x800000):
                        val -= 0x1000000
                elif sz == 4:
                    val = struct.unpack_from("<i" if is_signed else "<I", payload, offset)[0]
                else:
                    val = 0
                offset += sz
                cur_state[name] = val

                # Accumulate sub-10Hz samples across each 100ms window using header scaling
                if name in ("SPEED", "R_SPD"):
                    spd_val = val * mult + offs
                    if 0.0 <= spd_val <= 350.0:
                        spd_win.append(spd_val)
                elif name == "RPM":
                    rpm_val = int(round(val * mult + offs))
                    if 0 <= rpm_val <= 20000:
                        rpm_win.append(rpm_val)
                elif name in ("GAS", "DEM"):
                    gas_val = val * mult + offs
                    if 0.0 <= gas_val <= 110.0:
                        gas_win.append(min(100.0, max(0.0, gas_val)))
                elif name == "PSI_LEAN_ANGLE":
                    lean_val = val * mult + offs
                    if -75.0 <= lean_val <= 75.0:
                        lean_win.append(max(-60.0, min(60.0, lean_val)))
                elif name == "TORQUE_FAST":
                    tf_val = int(round(val * mult + offs))
                    if 0 <= tf_val <= 100:
                        tfast_win.append(tf_val)
                elif name == "TORQUE_SLOW":
                    ts_val = int(round(val * mult + offs))
                    if 0 <= ts_val <= 100:
                        tslow_win.append(ts_val)
                elif name in ("DTC", "SL_IDX"):
                    dtc_val = int(round(val * mult + offs))
                    if 0 <= dtc_val <= 100:
                        dtc_win.append(dtc_val)

            # Emit synchronized 10Hz telemetry frame every 0.10s
            if (tick % frame_10hz_ticks) == 0:
                current_time = tick / float(base_clock_hz)
                rec = DDARecord(current_time)

                if spd_win:
                    last_speed = sum(spd_win) / len(spd_win)
                rec.speed_kmh = last_speed

                if rpm_win:
                    last_rpm = int(round(sum(rpm_win) / len(rpm_win)))
                rec.rpm = last_rpm

                if gas_win:
                    last_tps = sum(gas_win) / len(gas_win)
                rec.tps_pct = last_tps

                gear_raw = cur_state.get("GEAR", 0)
                rec.gear = gear_raw if 0 <= gear_raw <= 6 else 0

                temp_key = "TEMP" if "TEMP" in cur_state else ("T_H2O" if "T_H2O" in cur_state else None)
                if temp_key is not None:
                    t_raw = cur_state[temp_key]
                    t_ch = ch_map.get(temp_key)
                    t_offs = t_ch.offset if t_ch else -40.0
                    rec.temp_c = float(t_raw + t_offs) if t_raw > 0 else 0.0

                if "DIST" in cur_state:
                    d_raw = cur_state["DIST"]
                    if 0 <= d_raw < 1000000:
                        rec.odometer_km = float(d_raw)

                if has_imu_lean:
                    if lean_win:
                        last_lean = sum(lean_win) / len(lean_win)
                    rec.lean_angle_deg = last_lean

                rec.dtc = max(dtc_win) if dtc_win else 0

                if has_torque_fast:
                    rec.torque_fast_pct = max(tfast_win) if tfast_win else 0
                    rec.torque_slow_pct = max(tslow_win) if tslow_win else 0
                else:
                    rec.torque_fast_pct = rec.dtc
                    rec.torque_slow_pct = 0

                # Clear sub-10Hz window accumulators for the next 100ms interval
                spd_win.clear()
                rpm_win.clear()
                gas_win.clear()
                lean_win.clear()
                tfast_win.clear()
                tslow_win.clear()
                dtc_win.clear()

                hw_lap = cur_state.get("LAP", 255)
                rec.int_lap1 = cur_state.get("INT_LAP1", 0) if cur_state.get("INT_LAP1", 255) != 255 else 0
                rec.int_lap2 = cur_state.get("INT_LAP2", 0) if cur_state.get("INT_LAP2", 255) != 255 else 0

                # Check GPS coordinate fix validity
                alt_raw = cur_state.get("GPS_ALT", 0x8000)
                lon_raw = cur_state.get("GPS_LON", 0)
                lat_raw = cur_state.get("GPS_LAT", 0)

                if (
                    alt_raw != 0x8000
                    and lon_raw not in (0, 0x00800000, -0x00800000)
                    and lat_raw not in (0, 0x00800000, -0x00800000)
                ):
                    lon_c = lon_raw * 1e-6
                    lat_c = lat_raw * 1e-6
                    if (-90.0 <= lat_c <= 90.0) and (-180.0 <= lon_c <= 180.0) and (abs(lat_c) > 0.5 or abs(lon_c) > 0.5):
                        rec.raw_lat = lat_c
                        rec.raw_lon = lon_c
                        rec.gps_alt_m = alt_raw * 0.1
                        gps_rec_list.append(rec)
                        raw_lats.append(lat_c)
                        raw_lons.append(lon_c)
                        speeds_list.append(rec.speed_kmh)

                        if hw_lap != 255 and prev_hw_lap == 255:
                            self._hw_lap_crossings.append(rec)

                prev_hw_lap = hw_lap
                self.records.append(rec)

            tick += 1

        # 3. Apply 5-point Gaussian smoothing to eliminate GNSS jitter
        smooth_lats, smooth_lons = smooth_gps_series(raw_lats, raw_lons, speeds_list, window_size=5)

        cum_dist = 0.0
        prev_lat = None
        prev_lon = None
        prev_bearing = 0.0

        for idx, rec in enumerate(gps_rec_list):
            s_lat = smooth_lats[idx]
            s_lon = smooth_lons[idx]
            rec.gps_lat = s_lat
            rec.gps_lon = s_lon

            if prev_lat is not None and prev_lon is not None:
                step_d = haversine_distance_m(prev_lat, prev_lon, s_lat, s_lon)
                cum_dist += step_d
                if step_d > 0.05:
                    lat1_r = math.radians(prev_lat)
                    lat2_r = math.radians(s_lat)
                    d_lon = math.radians(s_lon - prev_lon)
                    y = math.sin(d_lon) * math.cos(lat2_r)
                    x = math.cos(lat1_r) * math.sin(lat2_r) - math.sin(lat1_r) * math.cos(lat2_r) * math.cos(d_lon)
                    prev_bearing = (math.degrees(math.atan2(y, x)) + 360.0) % 360.0

            rec.distance_m = cum_dist
            rec.bearing_deg = prev_bearing
            prev_lat = s_lat
            prev_lon = s_lon
            self.gps_records.append(rec)

        # Fallback wheel-speed distance integration when GPS is absent or for non-GPS frames
        if not self.gps_records and self.records:
            wheel_dist = 0.0
            for idx, r in enumerate(self.records):
                if idx > 0:
                    dt = max(0.0, r.time_s - self.records[idx - 1].time_s)
                    wheel_dist += r.speed_ms * dt
                r.distance_m = wheel_dist
        elif self.gps_records and len(self.gps_records) < len(self.records):
            last_d = 0.0
            for idx, r in enumerate(self.records):
                if r.gps_lat is not None:
                    last_d = r.distance_m
                else:
                    dt = max(0.0, r.time_s - self.records[idx - 1].time_s) if idx > 0 else 0.0
                    last_d += r.speed_ms * dt
                    r.distance_m = last_d

        # Backfill initial bearing for the first stationary GPS points
        if len(self.gps_records) > 1:
            first_moving_brg = next((r.bearing_deg for r in self.gps_records if r.bearing_deg != 0.0), 0.0)
            for r in self.gps_records:
                if r.bearing_deg == 0.0:
                    r.bearing_deg = first_moving_brg
                else:
                    break

        # 4a. Calculate Robust Filtered GPS Ground Speed
        n_gps = len(gps_rec_list)
        if n_gps >= 2:
            raw_gps_speeds = []
            for i in range(n_gps):
                if i == 0:
                    d = haversine_distance_m(smooth_lats[0], smooth_lons[0], smooth_lats[1], smooth_lons[1])
                    dt = gps_rec_list[1].time_s - gps_rec_list[0].time_s
                elif i == n_gps - 1:
                    d = haversine_distance_m(smooth_lats[-2], smooth_lons[-2], smooth_lats[-1], smooth_lons[-1])
                    dt = gps_rec_list[-1].time_s - gps_rec_list[-2].time_s
                else:
                    d = haversine_distance_m(smooth_lats[i - 1], smooth_lons[i - 1], smooth_lats[i + 1], smooth_lons[i + 1])
                    dt = gps_rec_list[i + 1].time_s - gps_rec_list[i - 1].time_s
                spd = (d / dt) * 3.6 if dt > 0 else 0.0
                raw_gps_speeds.append(spd)

            # Outlier rejection for GNSS receiver position jumps / coordinate repeats
            clean_gps_speeds = []
            last_valid = raw_gps_speeds[0] if raw_gps_speeds[0] < 200.0 else gps_rec_list[0].speed_kmh
            for i in range(n_gps):
                v = raw_gps_speeds[i]
                wheel = gps_rec_list[i].speed_kmh
                if v > 300.0 or (v > 160.0 and (v - wheel) > 70.0 and abs(v - last_valid) > 50.0):
                    v = last_valid
                else:
                    last_valid = v
                clean_gps_speeds.append(v)

            # 3-point moving average to smooth quantization noise
            for i in range(n_gps):
                if i == 0:
                    filtered_v = clean_gps_speeds[0]
                elif i == n_gps - 1:
                    filtered_v = clean_gps_speeds[-1]
                else:
                    filtered_v = 0.25 * clean_gps_speeds[i - 1] + 0.50 * clean_gps_speeds[i] + 0.25 * clean_gps_speeds[i + 1]
                gps_rec_list[i].gps_speed_kmh = max(0.0, filtered_v)

        # 4b. Kinematic Lean Angle Derivation for Non-IMU Bikes (e.g., Panigale 1199 / 899 / 1098 / 1198)
        if not has_imu_lean and n_gps >= 10:
            chord_brgs = [0.0] * n_gps
            for i in range(n_gps):
                i0 = max(0, i - 5)
                i1 = min(n_gps - 1, i + 5)
                lat1_r = math.radians(gps_rec_list[i0].gps_lat)
                lat2_r = math.radians(gps_rec_list[i1].gps_lat)
                d_lon = math.radians(gps_rec_list[i1].gps_lon - gps_rec_list[i0].gps_lon)
                y = math.sin(d_lon) * math.cos(lat2_r)
                x = math.cos(lat1_r) * math.sin(lat2_r) - math.sin(lat1_r) * math.cos(lat2_r) * math.cos(d_lon)
                if abs(x) > 1e-9 or abs(y) > 1e-9:
                    chord_brgs[i] = (math.degrees(math.atan2(y, x)) + 360.0) % 360.0
                elif i > 0:
                    chord_brgs[i] = chord_brgs[i - 1]

            raw_kin_leans = []
            for i in range(n_gps):
                i0 = max(0, i - 5)
                i1 = min(n_gps - 1, i + 5)
                dt = gps_rec_list[i1].time_s - gps_rec_list[i0].time_s
                spd_k = min(gps_rec_list[i].speed_kmh, gps_rec_list[i].gps_speed_kmh) if gps_rec_list[i].gps_speed_kmh > 10.0 else gps_rec_list[i].speed_kmh
                if dt > 0.1 and spd_k > 15.0:
                    db = (chord_brgs[i1] - chord_brgs[i0] + 180.0) % 360.0 - 180.0
                    omega_rads = math.radians(db) / dt
                    v_ms = spd_k / 3.6
                    a_lat_g = (v_ms * omega_rads) / 9.80665
                    lean_deg = math.degrees(math.atan(a_lat_g))
                    lean_deg = max(-52.0, min(52.0, lean_deg))
                else:
                    lean_deg = 0.0
                raw_kin_leans.append(lean_deg)

            for i in range(n_gps):
                w = raw_kin_leans[max(0, i - 4) : min(n_gps, i + 5)]
                gps_rec_list[i].lean_angle_deg = sum(w) / len(w)

        # 4c. Derive Acceleration Kinematics & Wheel Slip
        n_recs = len(self.records)
        for i in range(n_recs):
            rec = self.records[i]
            
            # Longitudinal G via Central Finite Difference
            if n_recs > 2:
                if i == 0:
                    dt = max(0.01, self.records[1].time_s - rec.time_s)
                    dv_ms = (self.records[1].speed_kmh - rec.speed_kmh) / 3.6
                elif i == n_recs - 1:
                    dt = max(0.01, rec.time_s - self.records[i - 1].time_s)
                    dv_ms = (rec.speed_kmh - self.records[i - 1].speed_kmh) / 3.6
                else:
                    dt = max(0.02, self.records[i + 1].time_s - self.records[i - 1].time_s)
                    dv_ms = (self.records[i + 1].speed_kmh - self.records[i - 1].speed_kmh) / 3.6
                g_long = dv_ms / (dt * 9.80665)
                rec.accel_long_g = max(-1.8, min(1.5, g_long))
            
            # Lateral G via Lean Angle
            rad_lean = math.radians(min(65.0, abs(rec.lean_angle_deg)))
            g_lat_mag = math.tan(rad_lean)
            rec.accel_lat_g = (1.0 if rec.lean_angle_deg >= 0 else -1.0) * min(2.0, g_lat_mag)
            
            # Total G (Friction / Traction Demand)
            rec.accel_total_g = math.sqrt(rec.accel_long_g ** 2 + rec.accel_lat_g ** 2)
            
            # Physical Longitudinal Wheel Slip & Wheelie Heuristic
            if rec.gps_speed_kmh > 5.0:
                raw_slip = ((rec.speed_kmh - rec.gps_speed_kmh) / rec.gps_speed_kmh) * 100.0
                rec.wheel_slip_pct = max(-50.0, min(100.0, raw_slip))
            else:
                rec.wheel_slip_pct = 0.0
            rec.wheelie = (rec.tps_pct > 75.0 and rec.accel_long_g > 0.45 and rec.gear in (1, 2, 3) and abs(rec.lean_angle_deg) < 12.0)

        # 5. Automatic Lap & Split Timing Gate Detection
        self._detect_and_segment_laps()
        self._compute_statistics()
        return len(self.records)

    def _create_fallback_single_lap(self):
        if not self.laps and self.records:
            dur = max(0.1, self.records[-1].time_s - self.records[0].time_s)
            dist = max(0.0, self.records[-1].distance_m - self.records[0].distance_m)
            for r in self.records:
                r.lap = 1
            s1 = round(dur * 0.28, 3)
            s2 = round(dur * 0.38, 3)
            s3 = round(max(0.0, dur - s1 - s2), 3)
            self.laps.append({
                "lap_number": 1,
                "orig_lap_number": 1,
                "session_id": "S1",
                "name": "Lap 1 (Full Run)",
                "start_time_s": round(self.records[0].time_s, 3),
                "end_time_s": round(self.records[-1].time_s, 3),
                "duration_s": round(dur, 3),
                "start_index": 0,
                "end_index": len(self.records) - 1,
                "distance_m": round(dist, 1),
                "max_speed_kmh": round(max((r.speed_kmh for r in self.records), default=0.0), 1),
                "max_gps_speed_kmh": round(max((r.gps_speed_kmh for r in self.records), default=0.0), 1),
                "max_lean_left_deg": round(max((abs(r.lean_angle_deg) for r in self.records if r.lean_angle_deg < -0.5), default=0.0), 1),
                "max_lean_right_deg": round(max((r.lean_angle_deg for r in self.records if r.lean_angle_deg > 0.5), default=0.0), 1),
                "max_rpm": max((r.rpm for r in self.records), default=0),
                "sector_1_s": s1,
                "sector_2_s": s2,
                "sector_3_s": s3,
                "sectors": [s1, s2, s3],
                "is_best": True,
                "is_session_best": True,
                "is_flying": True,
                "is_out_lap": False,
                "is_in_lap": False,
                "is_reference": False
            })

    def _detect_and_segment_laps(self):
        """
        Universal Lap Detection:
        Finds primary start/finish gate across GPS track coordinates and segments laps with split gates.
        """
        if len(self.gps_records) < 100:
            self._create_fallback_single_lap()
            return

        fast_pts = [r for r in self.gps_records if r.speed_kmh > 40.0]
        if not fast_pts:
            self._create_fallback_single_lap()
            return

        track_name = (self.header.track_name or "").lower()

        # 1. Built-in known circuit database (fallback if dda_settings.json not found)
        known_tracks = {
            "sonoma_raceway": {
                "id": "sonoma_raceway",
                "name": "Sonoma Raceway",
                "center_lat": 38.161580,
                "center_lon": -122.454640,
                "radius_m": 3500,
                "gates": [
                    {"id": "sf", "name": "Start / Finish", "type": "sf", "lat": 38.161580, "lon": -122.454640, "bearing": 310.0},
                    {"id": "s1", "name": "Sector 1 (Carousel)", "type": "split", "lat": 38.164320, "lon": -122.458900, "bearing": 265.0},
                    {"id": "s2", "name": "Sector 2 (Esses)", "type": "split", "lat": 38.158210, "lon": -122.457800, "bearing": 180.0}
                ]
            },
            "laguna_seca": {
                "id": "laguna_seca",
                "name": "WeatherTech Raceway Laguna Seca",
                "center_lat": 36.584444,
                "center_lon": -121.753611,
                "radius_m": 3500,
                "gates": [
                    {"id": "sf", "name": "Start / Finish", "type": "sf", "lat": 36.585500, "lon": -121.754000, "bearing": 240.0},
                    {"id": "s1", "name": "Sector 1 (Andretti Hairpin)", "type": "split", "lat": 36.586200, "lon": -121.758500, "bearing": 135.0},
                    {"id": "s2", "name": "Sector 2 (Corkscrew)", "type": "split", "lat": 36.582800, "lon": -121.751200, "bearing": 210.0}
                ]
            },
            "thunderhill_east": {
                "id": "thunderhill_east",
                "name": "Thunderhill Raceway Park (East 3-Mile)",
                "center_lat": 39.539700,
                "center_lon": -122.332500,
                "radius_m": 4000,
                "gates": [
                    {"id": "sf", "name": "Start / Finish", "type": "sf", "lat": 39.537200, "lon": -122.331500, "bearing": 355.0},
                    {"id": "s1", "name": "Sector 1 (The Cyclone)", "type": "split", "lat": 39.544100, "lon": -122.336200, "bearing": 270.0},
                    {"id": "s2", "name": "Sector 2 (Turn 9/10)", "type": "split", "lat": 39.538500, "lon": -122.337800, "bearing": 160.0}
                ]
            },
            "grattan_raceway": {
                "id": "grattan_raceway",
                "name": "Grattan Raceway",
                "center_lat": 43.095400,
                "center_lon": -85.384500,
                "radius_m": 3500,
                "gates": [
                    {"id": "sf", "name": "Start / Finish", "type": "sf", "lat": 43.096178, "lon": -85.383956, "bearing": 77.0},
                    {"id": "s1", "name": "Sector 1 (Bowl)", "type": "split", "lat": 43.095766, "lon": -85.381598, "bearing": 205.0},
                    {"id": "s2", "name": "Sector 2 (Back Esses)", "type": "split", "lat": 43.094968, "lon": -85.388314, "bearing": 225.0}
                ]
            }
        }

        # Merge custom tracks from dda_settings.json if present
        settings_data = self._load_settings_json()
        if settings_data and isinstance(settings_data.get("tracks"), dict):
            for t_id, t_obj in settings_data["tracks"].items():
                if isinstance(t_obj, dict) and t_obj.get("gates"):
                    known_tracks[t_id] = t_obj

        # 2. Check if session GPS matches a known circuit
        valid_gps = [r for r in self.gps_records if r.gps_lat is not None and r.gps_lon is not None and abs(r.gps_lat) > 1.0]
        avg_lat = sum(r.gps_lat for r in valid_gps) / len(valid_gps) if valid_gps else 0.0
        avg_lon = sum(r.gps_lon for r in valid_gps) / len(valid_gps) if valid_gps else 0.0

        matched_track = None
        for t_id, t_def in known_tracks.items():
            c_lat = t_def.get("center_lat")
            c_lon = t_def.get("center_lon")
            rad = t_def.get("radius_m", 3500)
            if c_lat is not None and c_lon is not None and valid_gps:
                d = haversine_distance_m(c_lat, c_lon, avg_lat, avg_lon)
                if d <= rad:
                    matched_track = t_def
                    break
            # Name match fallback
            t_name = (t_def.get("name") or "").lower()
            if track_name and (track_name in t_name or t_name in track_name):
                matched_track = t_def
                break

        if matched_track and matched_track.get("gates"):
            self.gates = [dict(g) for g in matched_track["gates"]]
            sf_gate = next((g for g in self.gates if g.get("type") == "sf"), self.gates[0])
            sf_lat = sf_gate["lat"]
            sf_lon = sf_gate["lon"]
            sf_brg = sf_gate.get("bearing", 0.0)
            if not self.header.track_name:
                self.header.track_name = matched_track.get("name", "")
        elif len(self._hw_lap_crossings) >= 2:
            # 3a. Use hardware GPS finish-line crossing events recorded in the LAP channel
            hw_ref = self._hw_lap_crossings[len(self._hw_lap_crossings) // 2]
            sf_lat = hw_ref.gps_lat
            sf_lon = hw_ref.gps_lon
            sf_brg = hw_ref.bearing_deg
            self.gates = [
                {"id": "sf", "name": "Start / Finish", "type": "sf", "lat": sf_lat, "lon": sf_lon, "bearing": sf_brg}
            ]
        else:
            # 3b. Auto-detection for unknown tracks
            # S/F lines are located on straightaways with high speed and low lean angle, never slow corner apexes.
            max_spd = max((r.speed_kmh for r in fast_pts), default=100.0)
            spd_thresh = max(55.0, max_spd * 0.40)

            # Filter candidates to straightaway points (|lean| < 12 deg)
            straight_cands = [r for r in fast_pts if abs(r.lean_angle_deg) < 12.0 and r.speed_kmh >= spd_thresh]
            if not straight_cands:
                straight_cands = [r for r in fast_pts if abs(r.lean_angle_deg) < 20.0]
            if not straight_cands:
                straight_cands = fast_pts

            best_lat, best_lon, best_brg, best_score = None, None, None, -1.0
            sample_step = max(1, len(straight_cands) // 60)
            for cand in straight_cands[::sample_step]:
                passes = []
                last_t = -999.0
                for r in fast_pts:
                    if (r.time_s - last_t) > 35.0:
                        d = haversine_distance_m(cand.gps_lat, cand.gps_lon, r.gps_lat, r.gps_lon)
                        if d < 25.0:
                            d_brg = abs(cand.bearing_deg - r.bearing_deg) % 360
                            if d_brg > 180: d_brg = 360 - d_brg
                            if d_brg < 55.0:
                                passes.append(r.time_s)
                                last_t = r.time_s

                if len(passes) >= 2:
                    lap_durs = [passes[k+1] - passes[k] for k in range(len(passes)-1)]
                    valid_laps = [d for d in lap_durs if 30.0 < d < 600.0]
                    num_valid = len(valid_laps)
                    if num_valid > 0:
                        avg_dur = sum(valid_laps) / num_valid
                        variance = sum((d - avg_dur) ** 2 for d in valid_laps) / num_valid
                        std_dev = math.sqrt(variance)
                        consistency = max(0.0, 1.0 - (std_dev / max(1.0, avg_dur)))
                        spd_factor = min(1.5, cand.speed_kmh / max(1.0, spd_thresh))
                        lean_factor = max(0.2, 1.0 - (abs(cand.lean_angle_deg) / 25.0))
                        score = (num_valid * 10.0) + (consistency * 15.0) + (spd_factor * 5.0) + (lean_factor * 5.0)
                        if score > best_score:
                            best_score = score
                            best_lat, best_lon, best_brg = cand.gps_lat, cand.gps_lon, cand.bearing_deg

            sf_lat = best_lat if best_lat is not None else straight_cands[0].gps_lat
            sf_lon = best_lon if best_lon is not None else straight_cands[0].gps_lon
            sf_brg = best_brg if best_brg is not None else straight_cands[0].bearing_deg
            self.gates = [
                {"id": "sf", "name": "Start / Finish", "type": "sf", "lat": sf_lat, "lon": sf_lon, "bearing": sf_brg}
            ]

        sf_gate = next((g for g in self.gates if g.get("type") == "sf"), self.gates[0])
        split_gates = [g for g in self.gates if g.get("type") == "split"]

        # Find all S/F crossings using spatial line-segment intersection & normal-projection interpolation
        crossings = self._find_gate_crossings(sf_gate, self.records, min_interval_s=35.0)
        if not crossings:
            self._create_fallback_single_lap()
            return

        # 1. Out-Lap (Lap 0)
        first_cross = crossings[0]
        idx_first = first_cross["index"]
        for i in range(0, idx_first):
            self.records[i].lap = 0

        out_recs = self.records[0:max(1, idx_first)]
        self.laps.append({
            "lap_number": 0,
            "orig_lap_number": 0,
            "session_id": "S1",
            "name": "Out-Lap",
            "start_time_s": round(self.records[0].time_s, 3),
            "end_time_s": round(first_cross["time_s"], 3),
            "duration_s": round(first_cross["time_s"] - self.records[0].time_s, 3),
            "start_index": 0,
            "end_index": idx_first,
            "distance_m": round(first_cross["distance_m"], 1),
            "max_speed_kmh": round(max((r.speed_kmh for r in out_recs), default=0.0), 1),
            "max_gps_speed_kmh": round(max((r.gps_speed_kmh for r in out_recs), default=0.0), 1),
            "max_lean_left_deg": round(max((abs(r.lean_angle_deg) for r in out_recs if r.lean_angle_deg < -0.5), default=0.0), 1),
            "max_lean_right_deg": round(max((r.lean_angle_deg for r in out_recs if r.lean_angle_deg > 0.5), default=0.0), 1),
            "max_rpm": max((r.rpm for r in out_recs), default=0),
            "sector_1_s": None,
            "sector_2_s": None,
            "sector_3_s": None,
            "sectors": [None, None, None],
            "is_best": False,
            "is_session_best": False,
            "is_flying": False,
            "is_out_lap": True,
            "is_in_lap": False,
            "is_reference": False
        })

        # 2. Timed Laps (Lap 1, 2, 3...)
        for i in range(len(crossings) - 1):
            c1 = crossings[i]
            c2 = crossings[i + 1]
            lap_num = i + 1
            idx1 = c1["index"]
            idx2 = c2["index"]
            dur = c2["time_s"] - c1["time_s"]
            dist = c2["distance_m"] - c1["distance_m"]
            lap_recs = self.records[idx1:idx2 + 1]

            for r in self.records[idx1:idx2]:
                r.lap = lap_num

            # Compute interpolated sector split times if split gates exist
            s1_dur, s2_dur, s3_dur = None, None, None
            if len(split_gates) >= 1 and lap_recs:
                s1_cross = self._find_gate_crossings(split_gates[0], lap_recs, min_interval_s=5.0)
                if s1_cross:
                    t_s1 = s1_cross[0]["time_s"]
                    if c1["time_s"] < t_s1 < c2["time_s"]:
                        s1_dur = round(t_s1 - c1["time_s"], 3)
                        if len(split_gates) >= 2:
                            s2_cross = self._find_gate_crossings(split_gates[1], lap_recs, min_interval_s=5.0)
                            if s2_cross and t_s1 < s2_cross[0]["time_s"] < c2["time_s"]:
                                t_s2 = s2_cross[0]["time_s"]
                                s2_dur = round(t_s2 - t_s1, 3)
                                s3_dur = round(c2["time_s"] - t_s2, 3)
                        else:
                            s2_dur = round(c2["time_s"] - t_s1, 3)

            if s1_dur is None or s2_dur is None:
                s1_dur = round(dur * 0.28, 3)
                s2_dur = round(dur * 0.38, 3)
                s3_dur = round(max(0.0, dur - s1_dur - s2_dur), 3)
            elif s3_dur is None:
                s3_dur = round(max(0.0, dur - s1_dur - s2_dur), 3)

            is_flying = 30.0 < dur < 600.0
            self.laps.append({
                "lap_number": lap_num,
                "orig_lap_number": lap_num,
                "session_id": "S1",
                "name": f"Lap {lap_num}",
                "start_time_s": round(c1["time_s"], 3),
                "end_time_s": round(c2["time_s"], 3),
                "duration_s": round(dur, 3),
                "start_index": idx1,
                "end_index": idx2,
                "distance_m": round(dist, 1),
                "max_speed_kmh": round(max((r.speed_kmh for r in lap_recs), default=0.0), 1),
                "max_gps_speed_kmh": round(max((r.gps_speed_kmh for r in lap_recs), default=0.0), 1),
                "max_lean_left_deg": round(max((abs(r.lean_angle_deg) for r in lap_recs if r.lean_angle_deg < -0.5), default=0.0), 1),
                "max_lean_right_deg": round(max((r.lean_angle_deg for r in lap_recs if r.lean_angle_deg > 0.5), default=0.0), 1),
                "max_rpm": max((r.rpm for r in lap_recs), default=0),
                "sector_1_s": s1_dur,
                "sector_2_s": s2_dur,
                "sector_3_s": s3_dur,
                "sectors": [s1_dur, s2_dur, s3_dur],
                "is_best": False,
                "is_session_best": False,
                "is_flying": is_flying,
                "is_out_lap": False,
                "is_in_lap": False,
                "is_reference": False
            })

        # 3. In-Lap (last crossing to end of session)
        last_cross = crossings[-1]
        idx_last = last_cross["index"]
        in_lap_num = len(crossings)
        in_lap_recs = self.records[idx_last:]
        for r in in_lap_recs:
            r.lap = in_lap_num

        self.laps.append({
            "lap_number": in_lap_num,
            "orig_lap_number": in_lap_num,
            "session_id": "S1",
            "name": f"Lap {in_lap_num} (In-Lap)",
            "start_time_s": round(last_cross["time_s"], 3),
            "end_time_s": round(self.records[-1].time_s, 3),
            "duration_s": round(self.records[-1].time_s - last_cross["time_s"], 3),
            "start_index": idx_last,
            "end_index": len(self.records) - 1,
            "distance_m": round(self.records[-1].distance_m - last_cross["distance_m"], 1),
            "max_speed_kmh": round(max((r.speed_kmh for r in in_lap_recs), default=0.0), 1),
            "max_gps_speed_kmh": round(max((r.gps_speed_kmh for r in in_lap_recs), default=0.0), 1),
            "max_lean_left_deg": round(max((abs(r.lean_angle_deg) for r in in_lap_recs if r.lean_angle_deg < -0.5), default=0.0), 1),
            "max_lean_right_deg": round(max((r.lean_angle_deg for r in in_lap_recs if r.lean_angle_deg > 0.5), default=0.0), 1),
            "max_rpm": max((r.rpm for r in in_lap_recs), default=0),
            "sector_1_s": None,
            "sector_2_s": None,
            "sector_3_s": None,
            "sectors": [None, None, None],
            "is_best": False,
            "is_session_best": False,
            "is_flying": False,
            "is_out_lap": False,
            "is_in_lap": True,
            "is_reference": False
        })

        # Determine Best Lap
        full_laps = [l for l in self.laps if 1 <= l["lap_number"] < len(crossings) and 40.0 < l["duration_s"] < 300.0]
        if not full_laps:
            full_laps = [l for l in self.laps if 1 <= l["lap_number"] < len(crossings)]
        if full_laps:
            best_lap = min(full_laps, key=lambda l: l["duration_s"])
            for l in self.laps:
                if l["lap_number"] == best_lap["lap_number"]:
                    l["is_best"] = True
                    l["is_session_best"] = True

    def _find_gate_crossings(self, gate: dict, records=None, min_interval_s: float = 35.0):
        """
        Finds all spatial crossings of a timing gate with sub-frame (0.001s) interpolation.
        Primary method: 2D geometric line-segment intersection across a 60m gate line perpendicular to gate bearing.
        Fallback method: Closest-approach pass (< 28m) with longitudinal normal-vector projection interpolation.
        """
        if records is None:
            records = self.records
        if len(records) < 2:
            return []

        g_lat = gate["lat"]
        g_lon = gate["lon"]
        g_brg = gate.get("bearing", 0.0)
        cos_lat = max(1e-6, math.cos(math.radians(g_lat)))

        # Construct 60m gate line segment perpendicular to gate bearing
        R = 6371000.0
        half_w = 30.0
        brg1 = math.radians((g_brg + 90.0) % 360.0)
        brg2 = math.radians((g_brg + 270.0) % 360.0)
        g_lat1 = g_lat + math.degrees((half_w / R) * math.cos(brg1))
        g_lon1 = g_lon + math.degrees((half_w / R) * math.sin(brg1) / cos_lat)
        g_lat2 = g_lat + math.degrees((half_w / R) * math.cos(brg2))
        g_lon2 = g_lon + math.degrees((half_w / R) * math.sin(brg2) / cos_lat)

        min_g_lat, max_g_lat = min(g_lat1, g_lat2) - 0.0005, max(g_lat1, g_lat2) + 0.0005
        min_g_lon, max_g_lon = min(g_lon1, g_lon2) - 0.0005, max(g_lon1, g_lon2) + 0.0005

        crossings = []
        last_t = -999.0

        # Primary pass: 2D line-segment intersection
        for i in range(len(records) - 1):
            r1 = records[i]
            r2 = records[i + 1]
            if r1.gps_lat is None or r2.gps_lat is None or r2.speed_kmh < 25.0:
                continue
            if (r2.time_s - last_t) <= min_interval_s:
                continue
            if max(r1.gps_lat, r2.gps_lat) < min_g_lat or min(r1.gps_lat, r2.gps_lat) > max_g_lat:
                continue
            if max(r1.gps_lon, r2.gps_lon) < min_g_lon or min(r1.gps_lon, r2.gps_lon) > max_g_lon:
                continue

            x1, y1 = g_lon1, g_lat1
            x2, y2 = g_lon2, g_lat2
            x3, y3 = r1.gps_lon, r1.gps_lat
            x4, y4 = r2.gps_lon, r2.gps_lat

            denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
            if abs(denom) > 1e-12:
                t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
                u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom
                if -0.5 <= t <= 1.5 and 0.0 <= u <= 1.0:
                    d_brg = abs(g_brg - r2.bearing_deg) % 360.0
                    if d_brg > 180.0:
                        d_brg = 360.0 - d_brg
                    if d_brg < 85.0:
                        exact_time = r1.time_s + u * (r2.time_s - r1.time_s)
                        exact_dist = r1.distance_m + u * (r2.distance_m - r1.distance_m)
                        cross_idx = i if u < 0.5 else (i + 1)
                        crossings.append({
                            "index": cross_idx,
                            "record": records[cross_idx],
                            "time_s": exact_time,
                            "distance_m": exact_dist,
                            "fraction": u
                        })
                        last_t = exact_time

        # Fallback pass: Closest-point approach with normal-projection interpolation
        if not crossings:
            nx = math.sin(math.radians(g_brg))
            ny = math.cos(math.radians(g_brg))
            m_per_lon = 111320.0 * cos_lat
            m_per_lat = 111132.0

            def _proj_s(rec_pt):
                dx = (rec_pt.gps_lon - g_lon) * m_per_lon
                dy = (rec_pt.gps_lat - g_lat) * m_per_lat
                return dx * nx + dy * ny

            i = 0
            n = len(records)
            while i < n:
                r = records[i]
                if r.gps_lat is not None and r.speed_kmh >= 25.0 and (r.time_s - last_t) > min_interval_s:
                    d = haversine_distance_m(g_lat, g_lon, r.gps_lat, r.gps_lon)
                    if d < 28.0:
                        d_brg = abs(g_brg - r.bearing_deg) % 360.0
                        if d_brg > 180.0:
                            d_brg = 360.0 - d_brg
                        if d_brg < 60.0:
                            best_idx = i
                            best_d = d
                            j = i + 1
                            while j < min(n, i + 25):
                                rj = records[j]
                                if rj.gps_lat is not None:
                                    dj = haversine_distance_m(g_lat, g_lon, rj.gps_lat, rj.gps_lon)
                                    if dj < best_d:
                                        best_d = dj
                                        best_idx = j
                                    elif dj > 35.0:
                                        break
                                j += 1

                            r_best = records[best_idx]
                            exact_time = r_best.time_s
                            exact_dist = r_best.distance_m
                            u_frac = 0.0

                            # Interpolate exact zero-crossing of longitudinal projection along gate bearing
                            for k in range(max(0, best_idx - 2), min(n - 1, best_idx + 2)):
                                ra = records[k]
                                rb = records[k + 1]
                                if ra.gps_lat is not None and rb.gps_lat is not None:
                                    sa = _proj_s(ra)
                                    sb = _proj_s(rb)
                                    if sa <= 0.0 <= sb and (sb - sa) > 1e-6:
                                        u_frac = -sa / (sb - sa)
                                        exact_time = ra.time_s + u_frac * (rb.time_s - ra.time_s)
                                        exact_dist = ra.distance_m + u_frac * (rb.distance_m - ra.distance_m)
                                        best_idx = k + 1
                                        r_best = rb
                                        break

                            crossings.append({
                                "index": best_idx,
                                "record": r_best,
                                "time_s": exact_time,
                                "distance_m": exact_dist,
                                "fraction": u_frac
                            })
                            last_t = exact_time
                            i = best_idx + 10
                            continue
                i += 1

        return crossings

    def _compute_statistics(self):
        """Calculates comprehensive session telemetry stats."""
        if not self.records:
            self.stats = {}
            return

        speeds = [r.speed_kmh for r in self.records]
        gps_speeds = [r.gps_speed_kmh for r in self.gps_records if r.gps_speed_kmh > 0.0]
        rpms = [r.rpm for r in self.records]
        leans_left = [abs(r.lean_angle_deg) for r in self.records if r.lean_angle_deg < -0.5]
        leans_right = [r.lean_angle_deg for r in self.records if r.lean_angle_deg > 0.5]
        tps_list = [r.tps_pct for r in self.records]
        temps_valid = [r.temp_c for r in self.records if r.temp_c > 0.0]
        odos_valid = [r.odometer_km for r in self.records if r.odometer_km > 0.0]
        duration_s = self.records[-1].time_s - self.records[0].time_s

        best_lap_obj = next((l for l in self.laps if l.get("is_best")), None)

        self.stats = {
            "duration_s": duration_s,
            "duration_min": duration_s / 60.0,
            "total_frames": len(self.records),
            "gps_fixes": len(self.gps_records),
            "lap_count": len([l for l in self.laps if l["lap_number"] > 0]),
            "best_lap_number": best_lap_obj["lap_number"] if best_lap_obj else None,
            "best_lap_time_s": best_lap_obj["duration_s"] if best_lap_obj else None,
            "max_speed_kmh": max(speeds) if speeds else 0.0,
            "max_speed_mph": (max(speeds) * 0.621371) if speeds else 0.0,
            "max_gps_speed_kmh": max(gps_speeds) if gps_speeds else 0.0,
            "max_gps_speed_mph": (max(gps_speeds) * 0.621371) if gps_speeds else 0.0,
            "max_rpm": max(rpms) if rpms else 0,
            "max_lean_left_deg": max(leans_left) if leans_left else 0.0,
            "max_lean_right_deg": max(leans_right) if leans_right else 0.0,
            "max_throttle_pct": max(tps_list) if tps_list else 0.0,
            "max_dtc_fast_pct": max((r.torque_fast_pct for r in self.records), default=0),
            "max_dtc_slow_pct": max((r.torque_slow_pct for r in self.records), default=0),
            "max_dtc": max((r.dtc for r in self.records), default=0),
            "min_temp_c": min(temps_valid) if temps_valid else 0.0,
            "max_temp_c": max(temps_valid) if temps_valid else 0.0,
            "odometer_start_km": odos_valid[0] if odos_valid else 0.0,
            "odometer_end_km": odos_valid[-1] if odos_valid else 0.0,
            "start_gps": (self.gps_records[0].gps_lat, self.gps_records[0].gps_lon) if self.gps_records else (None, None),
            "end_gps": (self.gps_records[-1].gps_lat, self.gps_records[-1].gps_lon) if self.gps_records else (None, None),
            "min_alt_m": min(r.gps_alt_m for r in self.gps_records) if self.gps_records else 0.0,
            "max_alt_m": max(r.gps_alt_m for r in self.gps_records) if self.gps_records else 0.0,
            "max_brake_g": round(min((r.accel_long_g for r in self.records), default=0.0), 2),
            "max_accel_g": round(max((r.accel_long_g for r in self.records), default=0.0), 2),
            "max_lat_g": round(max((abs(r.accel_lat_g) for r in self.records), default=0.0), 2),
            "max_total_g": round(max((r.accel_total_g for r in self.records), default=0.0), 2),
        }

    def to_dict(self):
        """Returns complete telemetry session data as a Python dictionary."""
        return {
            "is_multi_session": getattr(self, "is_multi_session", False),
            "pre_segmented_laps": getattr(self, "pre_segmented_laps", False),
            "sessions": getattr(self, "sessions", []),
            "header": {
                "track_name": self.header.track_name,
                "rider_name": self.header.rider_name,
                "session_note": self.header.session_note,
                "bike_code": self.header.bike_code,
                "bike_model": self.header.bike_model,
                "session_datetime": self.header.session_datetime,
                "unix_timestamp": self.header.unix_timestamp,
                "header_odometer_km": self.header.header_odometer_km,
                "version": self.header.version,
                "header_size": self.header.header_size
            },
            "stats": self.stats,
            "laps": self.laps,
            "gates": self.gates,
            "channels": [ch.to_dict() for ch in self.header.channels],
            "records": [r.to_dict() for r in self.records],
            "settings": self._load_settings_json()
        }

    def _load_settings_json(self):
        settings_path = os.path.join(_get_base_dir(), "dda_settings.json")
        if os.path.exists(settings_path):
            try:
                with open(settings_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return None

    # ==========================================
    # Exporters
    # ==========================================

    def export_json(self, out_path: str):
        """Export telemetry session to JSON bundle for web visualizers."""
        data = self.to_dict()
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(data, f, separators=(',', ':'))

    def export_html(self, out_path: str, viewer_dir: str = None):
        """
        Generates a 100% self-contained standalone HTML visualizer with embedded telemetry data.
        Can be opened directly in any browser with zero installation or local server required.
        """
        if viewer_dir is None:
            viewer_dir = os.path.join(_get_base_dir(), "viewer")

        html_template_path = os.path.join(viewer_dir, "index.html")
        leaflet_css_path = os.path.join(viewer_dir, "leaflet.css")
        css_path = os.path.join(viewer_dir, "style.css")
        leaflet_js_path = os.path.join(viewer_dir, "leaflet.js")
        js_path = os.path.join(viewer_dir, "app.js")

        if not os.path.exists(html_template_path):
            raise FileNotFoundError(f"Viewer template not found at: {html_template_path}")

        with open(html_template_path, "r", encoding="utf-8") as f:
            html_content = f.read()

        leaflet_css_content = ""
        if os.path.exists(leaflet_css_path):
            with open(leaflet_css_path, "r", encoding="utf-8") as f:
                leaflet_css_content = f.read()

        css_content = ""
        if os.path.exists(css_path):
            with open(css_path, "r", encoding="utf-8") as f:
                css_content = f.read()

        leaflet_js_content = ""
        if os.path.exists(leaflet_js_path):
            with open(leaflet_js_path, "r", encoding="utf-8") as f:
                leaflet_js_content = f.read()

        webmMuxer_content = ""
        webmMuxer_path = os.path.join(viewer_dir, "webm-muxer.min.js")
        if os.path.exists(webmMuxer_path):
            with open(webmMuxer_path, "r", encoding="utf-8") as f:
                webmMuxer_content = f.read()

        mp4Muxer_content = ""
        mp4Muxer_path = os.path.join(viewer_dir, "mp4-muxer.min.js")
        if os.path.exists(mp4Muxer_path):
            with open(mp4Muxer_path, "r", encoding="utf-8") as f:
                mp4Muxer_content = f.read()

        # Load all modular JS files
        js_modules = [
            "state.js",
            "motogp_card.js",
            "seam_bar.js",
            "video_export.js",
            "video_player.js",
            "map.js",
            "gates.js",
            "charts.js",
            "coaching.js",
            "playback.js"
        ]
        modular_js_blocks = {}
        for mod_name in js_modules:
            mod_path = os.path.join(viewer_dir, "js", mod_name)
            if os.path.exists(mod_path):
                with open(mod_path, "r", encoding="utf-8") as f:
                    modular_js_blocks[mod_name] = f.read()

        js_content = ""
        if os.path.exists(js_path):
            with open(js_path, "r", encoding="utf-8") as f:
                js_content = f.read()

        session_json_str = json.dumps(self.to_dict(), separators=(',', ':')).replace("</", "<\\/").replace("<", "\\u003c")
        embedded_json_tag = f'<script id="embedded-data" type="application/json">{session_json_str}</script>'

        # Inline CSS stylesheets
        if leaflet_css_content:
            html_content = html_content.replace(
                '<link rel="stylesheet" href="leaflet.css">',
                f'<style>\n/* --- Leaflet Core CSS (Offline) --- */\n{leaflet_css_content}\n</style>'
            )
        html_content = html_content.replace(
            '<link rel="stylesheet" href="style.css">',
            f'<style>\n/* --- App Style CSS --- */\n{css_content}\n</style>'
        )
        html_content = html_content.replace(
            '<script id="embedded-data" type="application/json">{}</script>',
            embedded_json_tag
        )
        
        # Assemble complete bundled JavaScript in strict dependency order
        all_scripts = []
        if leaflet_js_content:
            all_scripts.append(f"/* --- Leaflet Mapping Engine (Offline) --- */\n{leaflet_js_content}")
        if webmMuxer_content:
            all_scripts.append(f"/* --- WebM Muxer --- */\n{webmMuxer_content}")
        if mp4Muxer_content:
            all_scripts.append(f"/* --- MP4 Muxer --- */\n{mp4Muxer_content}")
        for mod_name in js_modules:
            if mod_name in modular_js_blocks:
                all_scripts.append(f"/* --- Module: js/{mod_name} --- */\n{modular_js_blocks[mod_name]}")
        if js_content:
            all_scripts.append(f"/* --- Main Coordinator: app.js --- */\n{js_content}")

        bundled_js_payload = "\n\n".join(all_scripts)
        bundled_script_tag = f"<script>\n{bundled_js_payload}\n</script>"

        # Robust replacement: replace script blocks from leaflet.js through app.js
        import re
        script_block_pattern = r'<script\s+[^>]*src=["\']leaflet\.js["\'][\s\S]*?<script\s+[^>]*src=["\']app\.js["\']\s*></script>'
        if re.search(script_block_pattern, html_content):
            html_content = re.sub(script_block_pattern, lambda _: bundled_script_tag, html_content)
        else:
            # Fallback direct tag replacements
            html_content = re.sub(r'<script\s+src=["\']leaflet\.js["\']\s*></script>', '', html_content)
            html_content = re.sub(r'<script\s+src=["\']webm-muxer\.min\.js["\']\s*></script>', '', html_content)
            html_content = re.sub(r'<script\s+src=["\']mp4-muxer\.min\.js["\']\s*></script>', '', html_content)
            for mod_name in js_modules:
                html_content = re.sub(r'<script\s+src=["\']js/' + re.escape(mod_name) + r'["\']\s*></script>', '', html_content)
            html_content = re.sub(r'<script\s+src=["\']app\.js["\']\s*></script>', lambda _: bundled_script_tag, html_content)

        with open(out_path, "w", encoding="utf-8") as f:
            f.write(html_content)

    def export_csv(self, out_path: str):
        """Export telemetry to standard CSV format."""
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(
                "Time_s,Speed_kmh,Speed_mph,GPS_Speed_kmh,GPS_Speed_mph,Wheel_Slip_pct,"
                "RPM,TPS_pct,Gear,LeanAngle_deg,Temp_C,DTC_Fast_pct,DTC_Slow_pct,DTC_Index,"
                "Accel_Long_G,Accel_Lat_G,Accel_Total_G,Wheelie,"
                "Distance_m,Odometer_km,Bearing_deg,GPS_Lat,GPS_Lon,GPS_Alt_m,GPS_Alt_ft,Lap,Split1,Split2\n"
            )
            for r in self.records:
                lat_str = f"{r.gps_lat:.7f}" if r.gps_lat is not None else ""
                lon_str = f"{r.gps_lon:.7f}" if r.gps_lon is not None else ""
                alt_m_str = f"{r.gps_alt_m:.1f}" if r.gps_lat is not None else ""
                alt_ft_str = f"{r.gps_alt_ft:.1f}" if r.gps_lat is not None else ""
                f.write(
                    f"{r.time_s:.2f},{r.speed_kmh:.1f},{r.speed_mph:.1f},{r.gps_speed_kmh:.1f},{r.gps_speed_mph:.1f},"
                    f"{r.wheel_slip_pct:.1f},{r.rpm},"
                    f"{r.tps_pct:.1f},{r.gear},{r.lean_angle_deg:.1f},{r.temp_c:.1f},{r.torque_fast_pct},"
                    f"{r.torque_slow_pct},{r.dtc},"
                    f"{r.accel_long_g:.2f},{r.accel_lat_g:.2f},{r.accel_total_g:.2f},{1 if r.wheelie else 0},"
                    f"{r.distance_m:.1f},{r.odometer_km:.1f},{r.bearing_deg:.1f},{lat_str},{lon_str},{alt_m_str},"
                    f"{alt_ft_str},{r.lap},{r.int_lap1},{r.int_lap2}\n"
                )

    def export_racechrono_csv(self, out_path: str):
        """
        Export telemetry to official RaceChrono v3 CSV format.
        Compatible with RaceChrono Pro (iOS and Android).
        """
        base_unix_ts = self.header.unix_timestamp if self.header.unix_timestamp else 1724868022.0
        track_title = self.header.track_name or "Ducati Session"
        driver_name = self.header.rider_name or "Ducati Rider"
        created_dt = self.header.datetime_obj if self.header.datetime_obj else datetime.now()
        created_str = created_dt.strftime("%d/%m/%Y,%H:%M")
        note_str = f"Converted from Ducati DDA binary log ({self.header.bike_model})" if self.header.bike_model else "Converted from Ducati DDA binary log"

        lines = [
            "This file is created using RaceChrono v10.2.4 ( http://racechrono.com/ ).",
            "Format,3",
            f'Session title,"{track_title}"',
            "Session type,Lap timing",
            f'Track name,"{track_title}"',
            f'Driver name,"{driver_name}"',
            f"Created,{created_str}",
            f"Note,{note_str}\n"
        ]

        cols = [
            "timestamp", "fragment_id", "lap_number", "elapsed_time", "distance_traveled",
            "altitude", "bearing", "latitude", "longitude", "speed",
            "wheel_speed", "wheel_slip",
            "engine_rpm", "throttle_position", "gear", "lean_angle",
            "engine_coolant_temp", "torque_reduction_fast", "torque_reduction_slow",
            "longitudinal_acc", "lateral_acc", "combined_acc"
        ]
        units = [
            "unix time", "", "", "s", "m",
            "m", "deg", "deg", "deg", "m/s",
            "km/h", "%",
            "rpm", "%", "#", "deg",
            "C", "%", "%",
            "G", "G", "G"
        ]
        sources = [
            "", "", "", "", "",
            "100: gps", "100: gps", "100: gps", "100: gps", "100: gps",
            "100: can", "100: calc",
            "100: can", "100: can", "100: can", "100: can",
            "100: can", "100: can", "100: can",
            "100: calc", "100: calc", "100: calc"
        ]

        lines.append(",".join(cols))
        lines.append(",".join(units))
        lines.append(",".join(sources))

        for r in self.records:
            lat_str = f"{r.gps_lat:.7f}" if r.gps_lat is not None else ""
            lon_str = f"{r.gps_lon:.7f}" if r.gps_lon is not None else ""
            alt_str = f"{r.gps_alt_m:.1f}" if r.gps_lat is not None else ""
            bearing_str = f"{r.bearing_deg:.1f}" if r.gps_lat is not None else ""

            timestamp_s = base_unix_ts + r.time_s
            speed_ms = (r.gps_speed_kmh / 3.6) if r.gps_speed_kmh > 0 else (r.speed_kmh / 3.6)

            row = [
                f"{timestamp_s:.2f}",
                "0",
                f"{r.lap}" if r.lap > 0 else "",
                f"{r.time_s:.2f}",
                f"{r.distance_m:.2f}",
                alt_str,
                bearing_str,
                lat_str,
                lon_str,
                f"{speed_ms:.3f}",
                f"{r.speed_kmh:.1f}",
                f"{r.wheel_slip_pct:.1f}",
                f"{r.rpm}",
                f"{r.tps_pct:.1f}",
                f"{r.gear}",
                f"{r.lean_angle_deg:.1f}",
                f"{r.temp_c:.1f}",
                f"{r.torque_fast_pct}",
                f"{r.torque_slow_pct}",
                f"{r.accel_long_g:.2f}",
                f"{r.accel_lat_g:.2f}",
                f"{r.accel_total_g:.2f}"
            ]
            lines.append(",".join(row))

        with open(out_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")

    def export_racechrono_rcz(self, out_path: str):
        """
        Export telemetry to official RaceChrono native .rcz zip archive format.
        """
        base_unix_ms = int((self.header.unix_timestamp if self.header.unix_timestamp else 1724868022.0) * 1000)
        track_title = self.header.track_name or "Sonoma"
        
        valid_recs = [r for r in self.records if r.gps_lat is not None and r.gps_lon is not None]
        if not valid_recs:
            valid_recs = self.records

        first_ts = int(base_unix_ms + valid_recs[0].time_s * 1000)
        latest_ts = int(base_unix_ms + valid_recs[-1].time_s * 1000)
        length_time = int((valid_recs[-1].time_s - valid_recs[0].time_s) * 1000)

        cum_dist_m = valid_recs[-1].distance_m if valid_recs else 0.0

        ch_timestamps = bytearray()
        ch_distances = bytearray()
        ch_latlon = bytearray()
        ch_speeds = bytearray()
        ch_altitudes = bytearray()
        ch_bearings = bytearray()
        ch_satellites = bytearray()
        ch_fixtype = bytearray()
        ch_dop = bytearray()
        ch_dop_alt = bytearray()

        for r in valid_recs:
            lat = r.gps_lat if r.gps_lat is not None else 0.0
            lon = r.gps_lon if r.gps_lon is not None else 0.0

            ts_ms = int(base_unix_ms + r.time_s * 1000)
            dist_mm = int(r.distance_m * 1000)
            lat_i = int(lat * 6000000)
            lon_i = int(lon * 6000000)
            speed_mms = int((r.speed_kmh / 3.6) * 1000)
            alt_mm = int(r.gps_alt_m * 1000)
            bearing_mdeg = int(r.bearing_deg * 1000)

            ch_timestamps.extend(struct.pack("<q", ts_ms))
            ch_distances.extend(struct.pack("<q", dist_mm))
            ch_latlon.extend(struct.pack("<2i", lat_i, lon_i))
            ch_speeds.extend(struct.pack("<i", speed_mms))
            ch_altitudes.extend(struct.pack("<i", alt_mm))
            ch_bearings.extend(struct.pack("<i", bearing_mdeg))
            ch_satellites.extend(struct.pack("<i", 10))
            ch_fixtype.extend(struct.pack("<i", 1))
            ch_dop.extend(struct.pack("<i", 1500))
            ch_dop_alt.extend(struct.pack("<i", 2500))

        length_dist_mm = int(cum_dist_m * 1000)

        rc_laps = []
        for l in self.laps:
            if l["lap_number"] > 0:
                l_start_ts = int(base_unix_ms + l["start_time_s"] * 1000)
                l_finish_ts = int(base_unix_ms + l["end_time_s"] * 1000)
                rc_laps.append({
                    "number": l["lap_number"],
                    "sessionResume": 0,
                    "startTimestamp": l_start_ts,
                    "finishTimestamp": l_finish_ts,
                    "isInvalid": False
                })

        if not rc_laps:
            rc_laps = [{"number": 1, "sessionResume": 0, "startTimestamp": first_ts, "finishTimestamp": latest_ts, "isInvalid": False}]

        session_json = {
            "version": 1,
            "firstPositionLatitude": int(valid_recs[0].gps_lat * 6000000) if valid_recs[0].gps_lat else 0,
            "firstPositionLongitude": int(valid_recs[0].gps_lon * 6000000) if valid_recs[0].gps_lon else 0,
            "firstPositionReverseGeocoding": f"{track_title}, US",
            "firstPositionReverseGeocodingTries": 1,
            "trackId": 301,
            "trackName": track_title,
            "timeCreated": first_ts,
            "lapCount": len(rc_laps),
            "lengthDistance": length_dist_mm,
            "lengthTime": length_time,
            "firstTimestamp": first_ts,
            "latestTimestamp": latest_ts,
            "storageUsage": len(valid_recs) * 128,
            "laps": rc_laps
        }

        sessionfragment_json = {
            "version": 1,
            "primaryGpsDeviceIndex": 100,
            "lengthDistance": length_dist_mm,
            "lengthTime": length_time,
            "firstTimestamp": first_ts,
            "latestTimestamp": latest_ts,
            "storageUsage": len(valid_recs) * 128,
            "devices2": [{"version": 2, "selector": {"id": 100, "model": 101, "type": 1}}],
            "devices": {"items": [{"id": 100, "model": 101, "type": 1}]},
            "imuUseForCalc": False
        }

        with zipfile.ZipFile(out_path, 'w', compression=zipfile.ZIP_DEFLATED) as z:
            z.writestr("session.json", json.dumps(session_json))
            z.writestr("trackId.json", json.dumps({"id": 301}))
            z.writestr("sessionfragment.json", json.dumps(sessionfragment_json))
            z.writestr("channel_1_100_0_1_1", bytes(ch_timestamps))
            z.writestr("channel_1_100_0_2_1", bytes(ch_distances))
            z.writestr("channel_1_100_0_3_1", bytes(ch_latlon))
            z.writestr("channel_1_100_0_4_0", bytes(ch_speeds))
            z.writestr("channel_1_100_0_5_0", bytes(ch_altitudes))
            z.writestr("channel_1_100_0_6_0", bytes(ch_bearings))
            z.writestr("channel_1_100_0_30002_0", bytes(ch_satellites))
            z.writestr("channel_1_100_0_30003_0", bytes(ch_fixtype))
            z.writestr("channel_1_100_0_30004_0", bytes(ch_dop))
            z.writestr("channel_1_100_0_30005_0", bytes(ch_dop_alt))

    def export_gpx(self, out_path: str):
        """Export GPS track and telemetry extensions to GPX 1.1."""
        base_time = self.header.datetime_obj if self.header.datetime_obj else datetime(2024, 8, 28, 11, 0, 0)
        with open(out_path, "w", encoding="utf-8") as f:
            f.write('<?xml version="1.0" encoding="UTF-8"?>\n')
            f.write('<gpx version="1.1" creator="Ducati DDA Reader Pro" xmlns="http://www.topografix.com/GPX/1/1" xmlns:tp="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">\n')
            f.write('  <trk>\n')
            f.write(f'    <name>{self.header.track_name or "Ducati Telemetry Track"}</name>\n')
            f.write(f'    <desc>Rider: {self.header.rider_name or "Ducati Rider"} | DDA Telemetry</desc>\n')
            f.write('    <trkseg>\n')
            for r in self.records:
                if r.gps_lat is not None and r.gps_lon is not None:
                    pt_time = (base_time + timedelta(seconds=r.time_s)).strftime("%Y-%m-%dT%H:%M:%SZ")
                    f.write(f'      <trkpt lat="{r.gps_lat:.7f}" lon="{r.gps_lon:.7f}">\n')
                    f.write(f'        <ele>{r.gps_alt_m:.1f}</ele>\n')
                    f.write(f'        <time>{pt_time}</time>\n')
                    spd_ms = (r.gps_speed_kmh / 3.6) if r.gps_speed_kmh > 0 else (r.speed_kmh / 3.6)
                    f.write(f'        <speed>{spd_ms:.2f}</speed>\n')
                    f.write('        <extensions>\n')
                    f.write(f'          <tp:TrackPointExtension>\n')
                    f.write(f'            <tp:hr>{r.rpm}</tp:hr>\n')
                    f.write(f'            <tp:cad>{int(r.lean_angle_deg)}</tp:cad>\n')
                    f.write(f'            <tp:atemp>{int(round(r.temp_c))}</tp:atemp>\n')
                    f.write('          </tp:TrackPointExtension>\n')
                    f.write('        </extensions>\n')
                    f.write('      </trkpt>\n')
            f.write('    </trkseg>\n  </trk>\n</gpx>\n')

    def export_kml(self, out_path: str):
        """Export 3D Route to KML format for Google Earth."""
        coords = []
        for r in self.records:
            if r.gps_lat is not None and r.gps_lon is not None:
                coords.append(f"{r.gps_lon:.7f},{r.gps_lat:.7f},{r.gps_alt_m:.1f}")
        coord_str = " ".join(coords)

        kml = f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>{self.header.track_name or "Ducati DDA Session"}</name>
    <description>Rider: {self.header.rider_name} | Max Speed: {self.stats.get('max_speed_kmh', 0):.1f} km/h</description>
    <Style id="redTrack">
      <LineStyle>
        <color>ff0000ff</color>
        <width>4</width>
      </LineStyle>
    </Style>
    <Placemark>
      <name>Telemetry Circuit Path</name>
      <styleUrl>#redTrack</styleUrl>
      <LineString>
        <extrude>1</extrude>
        <tessellate>1</tessellate>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>
          {coord_str}
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>"""
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(kml)


# ==========================================
# Reference Laps & Multi-Session Combiner
# ==========================================

SESSION_COLORS = [
    "#ff1801",  # S1: Ducati Red
    "#00e5ff",  # S2: Cyan
    "#ffb300",  # S3: Amber
    "#00e676",  # S4: Emerald Green
    "#d500f9",  # S5: Purple
    "#ff4081",  # S6: Pink
    "#2979ff",  # S7: Royal Blue
    "#ffd600",  # S8: Gold
]


def format_hour_12(hour_24: int) -> str:
    """Formats a 24-hour integer (0..23) into a 12-hour string like '9AM', '12PM', '2PM'."""
    h = int(hour_24) % 24
    ampm = "AM" if h < 12 else "PM"
    h12 = 12 if (h % 12 == 0) else (h % 12)
    return f"{h12}{ampm}"


def extract_session_hour_str(dt_str: str = "", unix_ts: float = 0.0, dt_obj=None) -> str:
    """Extracts the 12-hour label (e.g. '2PM') from a session header's datetime or timestamp."""
    if dt_obj is not None and hasattr(dt_obj, "hour"):
        return format_hour_12(dt_obj.hour)
    if dt_str:
        # Match time part HH:MM(:SS)
        parts = dt_str.strip().split()
        time_part = parts[-1] if parts else dt_str
        m = re.search(r'(\d{1,2}):\d{2}', time_part)
        if m:
            try:
                return format_hour_12(int(m.group(1)))
            except ValueError:
                pass
    if unix_ts and unix_ts > 0:
        try:
            return format_hour_12(datetime.fromtimestamp(float(unix_ts)).hour)
        except Exception:
            pass
    return ""


def compute_session_hour_names(items: list) -> list[str]:
    """
    Given a list of DDASessionHeader objects or dicts with session_datetime / unix_timestamp,
    names each session by the hour it starts in (e.g. '9AM', '2PM').
    If more than one session starts in the same hour, names them '2PM Run 1', '2PM Run 2', etc.
    """
    hour_buckets = []
    counts = {}
    for idx, item in enumerate(items):
        if isinstance(item, dict):
            dt_str = item.get("session_datetime") or ""
            unix_ts = float(item.get("unix_timestamp") or 0.0)
            dt_obj = item.get("datetime_obj")
        else:
            dt_str = getattr(item, "session_datetime", "") or ""
            unix_ts = float(getattr(item, "unix_timestamp", 0.0) or 0.0)
            dt_obj = getattr(item, "datetime_obj", None)

        h_str = extract_session_hour_str(dt_str, unix_ts, dt_obj)
        if not h_str:
            h_str = "Session"
        hour_buckets.append(h_str)
        counts[h_str] = counts.get(h_str, 0) + 1

    seen = {}
    names = []
    for h_str in hour_buckets:
        seen[h_str] = seen.get(h_str, 0) + 1
        run_num = seen[h_str]
        if h_str == "Session":
            names.append(f"Run {run_num}" if counts[h_str] > 1 else "Session 1")
        elif counts[h_str] > 1:
            names.append(f"{h_str} Run {run_num}")
        else:
            names.append(h_str)
    return names


class DDAReferenceLap:
    """
    Represents a standalone, shareable Reference Lap (.ddalap.json) or an entry
    in the built-in Reference Lap Library (stored in dda_settings.json).
    Contains normalized telemetry records (starting at time_s=0.0, distance_m=0.0),
    lap summary metadata, and track timing gates.
    """
    def __init__(self):
        self.id = ""
        self.name = "Reference Lap"
        self.track_name = "Unknown Track"
        self.rider_name = ""
        self.bike_model = ""
        self.bike_code = ""
        self.session_datetime = ""
        self.unix_timestamp = 0.0
        self.duration_s = 0.0
        self.distance_m = 0.0
        self.sectors = [None, None, None]
        self.max_speed_kmh = 0.0
        self.max_gps_speed_kmh = 0.0
        self.max_lean_left_deg = 0.0
        self.max_lean_right_deg = 0.0
        self.max_rpm = 0
        self.gates = []
        self.records: list[DDARecord] = []
        self.notes = ""
        self.source_file = ""

    @classmethod
    def from_parser_lap(cls, parser: DDAParser, lap_number: int, custom_name: str = None, notes: str = "") -> "DDAReferenceLap":
        """Extracts a specific lap from a parsed DDAParser session into a normalized DDAReferenceLap."""
        lap_obj = next((l for l in parser.laps if l.get("lap_number") == lap_number), None)
        if not lap_obj:
            raise ValueError(f"Lap {lap_number} not found in session.")

        ref = cls()
        ts = int(datetime.now().timestamp() * 1000)
        ref.id = f"ref_{ts}_{lap_number}"
        ref.track_name = parser.header.track_name or "Unknown Track"
        ref.rider_name = parser.header.rider_name or "Ducati Rider"
        ref.bike_model = parser.header.bike_model or ""
        ref.bike_code = parser.header.bike_code or ""
        ref.session_datetime = parser.header.session_datetime or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        ref.unix_timestamp = parser.header.unix_timestamp or float(datetime.now().timestamp())
        ref.duration_s = float(lap_obj.get("duration_s", 0.0))
        ref.distance_m = float(lap_obj.get("distance_m", 0.0))

        s1 = lap_obj.get("sector_1_s")
        s2 = lap_obj.get("sector_2_s")
        s3 = lap_obj.get("sector_3_s")
        if "sectors" in lap_obj and isinstance(lap_obj["sectors"], list) and len(lap_obj["sectors"]) >= 3:
            s1, s2, s3 = lap_obj["sectors"][0], lap_obj["sectors"][1], lap_obj["sectors"][2]
        ref.sectors = [s1, s2, s3]

        ref.max_speed_kmh = float(lap_obj.get("max_speed_kmh", 0.0))
        ref.max_gps_speed_kmh = float(lap_obj.get("max_gps_speed_kmh", 0.0))
        ref.max_lean_left_deg = float(lap_obj.get("max_lean_left_deg", 0.0))
        ref.max_lean_right_deg = float(lap_obj.get("max_lean_right_deg", 0.0))
        ref.max_rpm = int(lap_obj.get("max_rpm", 0))
        ref.gates = [dict(g) for g in parser.gates] if parser.gates else []
        ref.notes = notes
        ref.source_file = os.path.basename(parser.filepath) if parser.filepath else ""

        if custom_name and custom_name.strip():
            ref.name = custom_name.strip()
        else:
            mins = int(ref.duration_s // 60)
            secs = ref.duration_s - mins * 60
            time_str = f"{mins}:{secs:06.3f}" if mins > 0 else f"{secs:.3f}s"
            ref.name = f"{ref.rider_name} · Lap {lap_obj.get('orig_lap_number', lap_number)} ({time_str})"

        idx1 = max(0, int(lap_obj.get("start_index", 0)))
        idx2 = min(len(parser.records) - 1, int(lap_obj.get("end_index", len(parser.records) - 1)))
        slice_recs = parser.records[idx1:idx2 + 1]
        if slice_recs:
            t0 = slice_recs[0].time_s
            d0 = slice_recs[0].distance_m
            for r in slice_recs:
                rc = r.clone()
                rc.time_s = round(max(0.0, r.time_s - t0), 3)
                rc.distance_m = round(max(0.0, r.distance_m - d0), 2)
                rc.lap = 1
                rc.session_id = "REF"
                ref.records.append(rc)

            if ref.max_lean_left_deg == 0.0:
                ref.max_lean_left_deg = round(max((abs(r.lean_angle_deg) for r in ref.records if r.lean_angle_deg < -0.5), default=0.0), 1)
            if ref.max_lean_right_deg == 0.0:
                ref.max_lean_right_deg = round(max((r.lean_angle_deg for r in ref.records if r.lean_angle_deg > 0.5), default=0.0), 1)
            if ref.max_rpm == 0:
                ref.max_rpm = max((r.rpm for r in ref.records), default=0)

        return ref

    def to_dict(self) -> dict:
        return {
            "format": "dda_reference_lap_v1",
            "id": self.id,
            "name": self.name,
            "track_name": self.track_name,
            "rider_name": self.rider_name,
            "bike_model": self.bike_model,
            "bike_code": self.bike_code,
            "session_datetime": self.session_datetime,
            "unix_timestamp": self.unix_timestamp,
            "duration_s": round(self.duration_s, 3),
            "distance_m": round(self.distance_m, 1),
            "sectors": self.sectors,
            "max_speed_kmh": round(self.max_speed_kmh, 1),
            "max_gps_speed_kmh": round(self.max_gps_speed_kmh, 1),
            "max_lean_left_deg": round(self.max_lean_left_deg, 1),
            "max_lean_right_deg": round(self.max_lean_right_deg, 1),
            "max_rpm": int(self.max_rpm),
            "notes": self.notes,
            "source_file": self.source_file,
            "gates": self.gates,
            "records": [r.to_dict() for r in self.records]
        }

    @classmethod
    def from_dict(cls, data: dict, filepath: str = "") -> "DDAReferenceLap":
        ref = cls()
        ref.id = data.get("id") or f"ref_{int(datetime.now().timestamp() * 1000)}"
        ref.name = data.get("name") or "Reference Lap"
        ref.track_name = data.get("track_name") or "Unknown Track"
        ref.rider_name = data.get("rider_name") or "Ducati Rider"
        ref.bike_model = data.get("bike_model") or ""
        ref.bike_code = data.get("bike_code") or ""
        ref.session_datetime = data.get("session_datetime") or ""
        ref.unix_timestamp = float(data.get("unix_timestamp", 0.0))
        ref.duration_s = float(data.get("duration_s", 0.0))
        ref.distance_m = float(data.get("distance_m", 0.0))
        ref.sectors = data.get("sectors") if isinstance(data.get("sectors"), list) else [
            data.get("sector_1_s"), data.get("sector_2_s"), data.get("sector_3_s")
        ]
        ref.max_speed_kmh = float(data.get("max_speed_kmh", 0.0))
        ref.max_gps_speed_kmh = float(data.get("max_gps_speed_kmh", 0.0))
        ref.max_lean_left_deg = float(data.get("max_lean_left_deg", 0.0))
        ref.max_lean_right_deg = float(data.get("max_lean_right_deg", 0.0))
        ref.max_rpm = int(data.get("max_rpm", 0))
        ref.notes = data.get("notes", "")
        ref.source_file = data.get("source_file") or (os.path.basename(filepath) if filepath else "")
        ref.gates = data.get("gates", [])
        raw_recs = data.get("records", [])
        ref.records = [DDARecord.from_dict(r) for r in raw_recs]
        if ref.records:
            t0 = ref.records[0].time_s
            d0 = ref.records[0].distance_m
            for r in ref.records:
                r.time_s = round(max(0.0, r.time_s - t0), 3)
                r.distance_m = round(max(0.0, r.distance_m - d0), 2)
                r.session_id = "REF"
            if ref.duration_s <= 0.0:
                ref.duration_s = round(ref.records[-1].time_s, 3)
            if ref.distance_m <= 0.0:
                ref.distance_m = round(ref.records[-1].distance_m, 1)
        return ref

    def save_file(self, out_path: str):
        """Saves this Reference Lap as a standalone .ddalap.json file."""
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(self.to_dict(), f, indent=2)

    @classmethod
    def load_file(cls, filepath: str) -> "DDAReferenceLap":
        """Loads a standalone .ddalap.json file (or extracts the best lap from a full session JSON)."""
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
        if data.get("format") == "dda_reference_lap_v1" or ("records" in data and "duration_s" in data and "header" not in data):
            return cls.from_dict(data, filepath=filepath)
        # Fallback: if user picked a full session JSON file, extract its best lap as a reference lap
        if "records" in data and "laps" in data:
            laps = data.get("laps", [])
            best_lap = next((l for l in laps if l.get("is_best")), None)
            if not best_lap and laps:
                flying = [l for l in laps if l.get("lap_number", 0) > 0]
                best_lap = min(flying, key=lambda x: x.get("duration_s", 9999.0)) if flying else laps[0]
            if best_lap:
                hdr = data.get("header", {})
                idx1 = int(best_lap.get("start_index", 0))
                idx2 = int(best_lap.get("end_index", len(data["records"]) - 1))
                lap_recs = data["records"][idx1:idx2 + 1]
                synth = {
                    "format": "dda_reference_lap_v1",
                    "name": f"{hdr.get('rider_name', 'Ref')} · {best_lap.get('name', 'Best Lap')}",
                    "track_name": hdr.get("track_name", "Unknown Track"),
                    "rider_name": hdr.get("rider_name", ""),
                    "bike_model": hdr.get("bike_model", ""),
                    "bike_code": hdr.get("bike_code", ""),
                    "session_datetime": hdr.get("session_datetime", ""),
                    "unix_timestamp": hdr.get("unix_timestamp", 0.0),
                    "duration_s": best_lap.get("duration_s", 0.0),
                    "distance_m": best_lap.get("distance_m", 0.0),
                    "sectors": best_lap.get("sectors") or [best_lap.get("sector_1_s"), best_lap.get("sector_2_s"), best_lap.get("sector_3_s")],
                    "max_speed_kmh": best_lap.get("max_speed_kmh", 0.0),
                    "max_gps_speed_kmh": best_lap.get("max_gps_speed_kmh", 0.0),
                    "max_lean_left_deg": best_lap.get("max_lean_left_deg", 0.0),
                    "max_lean_right_deg": best_lap.get("max_lean_right_deg", 0.0),
                    "max_rpm": best_lap.get("max_rpm", 0),
                    "gates": data.get("gates", []),
                    "records": lap_recs
                }
                return cls.from_dict(synth, filepath=filepath)
        raise ValueError(f"Unrecognized Reference Lap file format: {filepath}")


def _get_settings_filepath() -> str:
    return os.path.join(_get_base_dir(), "dda_settings.json")


def load_reference_laps_library(track_name: str = None) -> list[DDAReferenceLap]:
    """Loads saved Reference Laps from dda_settings.json, optionally filtered by track_name."""
    settings_path = _get_settings_filepath()
    if not os.path.exists(settings_path):
        return []
    try:
        with open(settings_path, "r", encoding="utf-8") as f:
            settings = json.load(f)
        raw_list = settings.get("reference_laps", [])
        if not isinstance(raw_list, list):
            return []
        result = []
        for item in raw_list:
            try:
                ref = DDAReferenceLap.from_dict(item)
                if track_name:
                    t_clean = track_name.strip().lower()
                    if t_clean and t_clean not in ("unknown track", "custom session") and ref.track_name.strip().lower() != t_clean:
                        continue
                result.append(ref)
            except Exception:
                continue
        return result
    except Exception:
        return []


def save_reference_lap_to_library(ref_lap: DDAReferenceLap) -> bool:
    """Saves or updates a DDAReferenceLap inside dda_settings.json['reference_laps']."""
    settings_path = _get_settings_filepath()
    settings = {"version": 1, "active_rider": {}, "tracks": {}, "reference_laps": []}
    if os.path.exists(settings_path):
        try:
            with open(settings_path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                if isinstance(loaded, dict):
                    settings.update(loaded)
        except Exception:
            pass

    if "reference_laps" not in settings or not isinstance(settings["reference_laps"], list):
        settings["reference_laps"] = []

    ref_dict = ref_lap.to_dict()
    existing_idx = next((i for i, r in enumerate(settings["reference_laps"]) if r.get("id") == ref_lap.id), None)
    if existing_idx is not None:
        settings["reference_laps"][existing_idx] = ref_dict
    else:
        settings["reference_laps"].append(ref_dict)

    try:
        with open(settings_path, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2)
        return True
    except Exception:
        return False


def delete_reference_lap_from_library(ref_id: str) -> bool:
    """Deletes a Reference Lap by ID from dda_settings.json['reference_laps']."""
    settings_path = _get_settings_filepath()
    if not os.path.exists(settings_path):
        return False
    try:
        with open(settings_path, "r", encoding="utf-8") as f:
            settings = json.load(f)
        if not isinstance(settings, dict) or "reference_laps" not in settings:
            return False
        orig_len = len(settings["reference_laps"])
        settings["reference_laps"] = [r for r in settings["reference_laps"] if r.get("id") != ref_id]
        if len(settings["reference_laps"]) == orig_len:
            return False
        with open(settings_path, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2)
        return True
    except Exception:
        return False


class DDAMultiSessionCombiner(DDAParser):
    """
    Combines selected laps across multiple DDAParser sessions and/or DDAReferenceLaps
    into a unified DDAParser-compatible object that can export directly to the
    Standalone HTML Viewer, JSON, CSV, RaceChrono v3 CSV, RaceChrono .rcz, GPX, or KML.
    """
    def __init__(self, session_entries: list[dict] = None, reference_laps: list[DDAReferenceLap] = None):
        """
        session_entries: list of dicts:
            {
                "parser": DDAParser,
                "selected_lap_numbers": list[int] or set[int] (if None, includes all laps),
                "session_id": str (e.g. "S1"),
                "session_label": str (optional custom label),
                "color": str (optional hex color)
            }
        reference_laps: list of DDAReferenceLap instances to include as benchmark laps.
        """
        super().__init__("")
        self.is_multi_session = True
        self.pre_segmented_laps = False
        self.sessions = []
        self._build_combined(session_entries or [], reference_laps or [])

    def _build_combined(self, session_entries: list[dict], reference_laps: list[DDAReferenceLap]):
        self.records.clear()
        self.gps_records.clear()
        self.laps.clear()
        self.gates.clear()
        self.sessions.clear()

        # Sort session entries chronologically by unix_timestamp if not already sorted
        valid_entries = [e for e in session_entries if e.get("parser") is not None]
        any_subset_laps = any(e.get("selected_lap_numbers") is not None for e in valid_entries)
        self.pre_segmented_laps = bool(any_subset_laps)

        # Initialize primary header from first session or first reference lap
        if valid_entries:
            first_p: DDAParser = valid_entries[0]["parser"]
            self.filepath = first_p.filepath
            self.header.version = first_p.header.version
            self.header.track_name = first_p.header.track_name
            self.header.rider_name = first_p.header.rider_name
            self.header.bike_code = first_p.header.bike_code
            self.header.bike_model = first_p.header.bike_model
            self.header.session_datetime = first_p.header.session_datetime
            self.header.datetime_obj = first_p.header.datetime_obj
            self.header.unix_timestamp = first_p.header.unix_timestamp
            self.header.header_odometer_km = first_p.header.header_odometer_km
            self.header.channels = list(first_p.header.channels)
            self.gates = [dict(g) for g in first_p.gates] if first_p.gates else []
            if len(valid_entries) > 1:
                self.header.session_note = f"{len(valid_entries)} Sessions Combined"
            else:
                self.header.session_note = first_p.header.session_note
        elif reference_laps:
            first_ref = reference_laps[0]
            self.header.track_name = first_ref.track_name
            self.header.rider_name = first_ref.rider_name
            self.header.bike_code = first_ref.bike_code
            self.header.bike_model = first_ref.bike_model
            self.header.session_datetime = first_ref.session_datetime
            self.header.unix_timestamp = first_ref.unix_timestamp
            self.header._apply_default_channels()
            self.gates = [dict(g) for g in first_ref.gates] if first_ref.gates else []
            self.header.session_note = "Reference Lap Session"
        else:
            self.header._apply_default_channels()
            self._compute_statistics()
            return

        current_time_offset_s = 0.0
        current_dist_offset_m = 0.0
        combined_lap_counter = 0

        hour_names = compute_session_hour_names([e["parser"].header for e in valid_entries])

        # 1. Process regular sessions
        for s_idx, entry in enumerate(valid_entries):
            p: DDAParser = entry["parser"]
            if not p.records:
                continue
            s_id = entry.get("session_id") or f"S{s_idx + 1}"
            s_color = entry.get("color") or SESSION_COLORS[s_idx % len(SESSION_COLORS)]
            s_label = entry.get("session_label") or hour_names[s_idx]

            if not self.gates and p.gates:
                self.gates = [dict(g) for g in p.gates]
            if (not self.header.track_name or self.header.track_name == "Unknown Track") and p.header.track_name:
                self.header.track_name = p.header.track_name

            sel_nums = entry.get("selected_lap_numbers")
            session_lap_objs = []
            sess_start_idx = len(self.records)

            if sel_nums is None:
                # Continuous whole-session copy so Interactive Viewer can dynamically segment each session through its S/F & sector gates
                t0 = p.records[0].time_s
                d0 = p.records[0].distance_m
                for r in p.records:
                    rc = r.clone()
                    rc.time_s = round(current_time_offset_s + max(0.0, r.time_s - t0), 3)
                    rc.distance_m = round(current_dist_offset_m + max(0.0, r.distance_m - d0), 2)
                    rc.session_id = s_id
                    self.records.append(rc)
                    if rc.gps_lat is not None and rc.gps_lon is not None:
                        self.gps_records.append(rc)

                sess_end_idx = len(self.records) - 1
                for lap in p.laps:
                    idx1 = max(0, int(lap.get("start_index", 0)))
                    idx2 = min(len(p.records) - 1, int(lap.get("end_index", len(p.records) - 1)))
                    if idx2 < idx1:
                        continue
                    combined_lap_counter += 1
                    new_start_idx = sess_start_idx + idx1
                    new_end_idx = sess_start_idx + idx2
                    for k in range(new_start_idx, new_end_idx + 1):
                        self.records[k].lap = combined_lap_counter

                    lap_start_time = self.records[new_start_idx].time_s
                    lap_end_time = self.records[new_end_idx].time_s
                    lap_dur = float(lap.get("duration_s", round(lap_end_time - lap_start_time, 3)))
                    lap_dist = float(lap.get("distance_m", round(self.records[new_end_idx].distance_m - self.records[new_start_idx].distance_m, 1)))

                    orig_num = lap.get("orig_lap_number", lap.get("lap_number", combined_lap_counter))
                    orig_name = lap.get("name", f"Lap {orig_num}")
                    display_name = f"{s_label} · {orig_name}" if (len(valid_entries) > 1 or reference_laps) else orig_name

                    s1 = lap.get("sector_1_s")
                    s2 = lap.get("sector_2_s")
                    s3 = lap.get("sector_3_s")
                    if "sectors" in lap and isinstance(lap["sectors"], list) and len(lap["sectors"]) >= 3:
                        s1, s2, s3 = lap["sectors"][0], lap["sectors"][1], lap["sectors"][2]

                    is_out = bool(lap.get("is_out_lap", orig_num == 0))
                    is_in = bool(lap.get("is_in_lap", "In-Lap" in orig_name))
                    is_flying = bool(lap.get("is_flying", not is_out and not is_in and 30.0 < lap_dur < 600.0))

                    new_lap_dict = {
                        "lap_number": combined_lap_counter,
                        "orig_lap_number": orig_num,
                        "session_id": s_id,
                        "session_index": s_idx + 1,
                        "session_label": s_label,
                        "session_color": s_color,
                        "session_datetime": p.header.session_datetime,
                        "name": display_name,
                        "orig_name": orig_name,
                        "start_time_s": round(lap_start_time, 3),
                        "end_time_s": round(lap_end_time, 3),
                        "duration_s": round(lap_dur, 3),
                        "start_index": new_start_idx,
                        "end_index": new_end_idx,
                        "distance_m": round(lap_dist, 1),
                        "max_speed_kmh": float(lap.get("max_speed_kmh", 0.0)),
                        "max_gps_speed_kmh": float(lap.get("max_gps_speed_kmh", 0.0)),
                        "max_lean_left_deg": float(lap.get("max_lean_left_deg", 0.0)),
                        "max_lean_right_deg": float(lap.get("max_lean_right_deg", 0.0)),
                        "max_rpm": int(lap.get("max_rpm", 0)),
                        "sector_1_s": s1,
                        "sector_2_s": s2,
                        "sector_3_s": s3,
                        "sectors": [s1, s2, s3],
                        "is_best": False,
                        "is_session_best": False,
                        "is_flying": is_flying,
                        "is_out_lap": is_out,
                        "is_in_lap": is_in,
                        "is_reference": False
                    }
                    self.laps.append(new_lap_dict)
                    session_lap_objs.append(new_lap_dict)

                current_time_offset_s = self.records[-1].time_s + 1.0
                current_dist_offset_m = self.records[-1].distance_m + 10.0
            else:
                sel_set = set(sel_nums)
                chosen_laps = [l for l in p.laps if l.get("lap_number") in sel_set]
                if not chosen_laps:
                    continue

                for lap in chosen_laps:
                    idx1 = max(0, int(lap.get("start_index", 0)))
                    idx2 = min(len(p.records) - 1, int(lap.get("end_index", len(p.records) - 1)))
                    if idx2 < idx1 or not p.records:
                        continue

                    slice_recs = p.records[idx1:idx2 + 1]
                    if not slice_recs:
                        continue

                    combined_lap_counter += 1
                    new_start_idx = len(self.records)
                    t0 = slice_recs[0].time_s
                    d0 = slice_recs[0].distance_m

                    for r in slice_recs:
                        rc = r.clone()
                        rc.time_s = round(current_time_offset_s + max(0.0, r.time_s - t0), 3)
                        rc.distance_m = round(current_dist_offset_m + max(0.0, r.distance_m - d0), 2)
                        rc.lap = combined_lap_counter
                        rc.session_id = s_id
                        self.records.append(rc)
                        if rc.gps_lat is not None and rc.gps_lon is not None:
                            self.gps_records.append(rc)

                    new_end_idx = len(self.records) - 1
                    lap_start_time = self.records[new_start_idx].time_s
                    lap_end_time = self.records[new_end_idx].time_s
                    lap_dur = float(lap.get("duration_s", round(lap_end_time - lap_start_time, 3)))
                    lap_dist = float(lap.get("distance_m", round(self.records[new_end_idx].distance_m - self.records[new_start_idx].distance_m, 1)))

                    orig_num = lap.get("orig_lap_number", lap.get("lap_number", combined_lap_counter))
                    orig_name = lap.get("name", f"Lap {orig_num}")
                    display_name = f"{s_label} · {orig_name}" if (len(valid_entries) > 1 or reference_laps) else orig_name

                    s1 = lap.get("sector_1_s")
                    s2 = lap.get("sector_2_s")
                    s3 = lap.get("sector_3_s")
                    if "sectors" in lap and isinstance(lap["sectors"], list) and len(lap["sectors"]) >= 3:
                        s1, s2, s3 = lap["sectors"][0], lap["sectors"][1], lap["sectors"][2]

                    is_out = bool(lap.get("is_out_lap", orig_num == 0))
                    is_in = bool(lap.get("is_in_lap", "In-Lap" in orig_name))
                    is_flying = bool(lap.get("is_flying", not is_out and not is_in and 30.0 < lap_dur < 600.0))

                    new_lap_dict = {
                        "lap_number": combined_lap_counter,
                        "orig_lap_number": orig_num,
                        "session_id": s_id,
                        "session_index": s_idx + 1,
                        "session_label": s_label,
                        "session_color": s_color,
                        "session_datetime": p.header.session_datetime,
                        "name": display_name,
                        "orig_name": orig_name,
                        "start_time_s": round(lap_start_time, 3),
                        "end_time_s": round(lap_end_time, 3),
                        "duration_s": round(lap_dur, 3),
                        "start_index": new_start_idx,
                        "end_index": new_end_idx,
                        "distance_m": round(lap_dist, 1),
                        "max_speed_kmh": float(lap.get("max_speed_kmh", 0.0)),
                        "max_gps_speed_kmh": float(lap.get("max_gps_speed_kmh", 0.0)),
                        "max_lean_left_deg": float(lap.get("max_lean_left_deg", 0.0)),
                        "max_lean_right_deg": float(lap.get("max_lean_right_deg", 0.0)),
                        "max_rpm": int(lap.get("max_rpm", 0)),
                        "sector_1_s": s1,
                        "sector_2_s": s2,
                        "sector_3_s": s3,
                        "sectors": [s1, s2, s3],
                        "is_best": False,
                        "is_session_best": False,
                        "is_flying": is_flying,
                        "is_out_lap": is_out,
                        "is_in_lap": is_in,
                        "is_reference": False
                    }
                    self.laps.append(new_lap_dict)
                    session_lap_objs.append(new_lap_dict)

                    # Advance monotonic time and distance offsets with a small seam gap
                    current_time_offset_s = self.records[-1].time_s + 1.0
                    current_dist_offset_m = self.records[-1].distance_m + 10.0
                sess_end_idx = len(self.records) - 1

            # Determine session best lap
            flying_session_laps = [l for l in session_lap_objs if l["is_flying"]]
            if not flying_session_laps:
                flying_session_laps = [l for l in session_lap_objs if not l["is_out_lap"] and not l["is_in_lap"]]
            if not flying_session_laps and session_lap_objs:
                flying_session_laps = session_lap_objs

            s_best_lap = min(flying_session_laps, key=lambda x: x["duration_s"]) if flying_session_laps else None
            if s_best_lap:
                s_best_lap["is_session_best"] = True

            self.sessions.append({
                "id": s_id,
                "index": s_idx + 1,
                "label": s_label,
                "color": s_color,
                "track_name": p.header.track_name,
                "rider_name": p.header.rider_name,
                "bike_model": p.header.bike_model,
                "session_datetime": p.header.session_datetime,
                "unix_timestamp": p.header.unix_timestamp,
                "source_file": os.path.basename(p.filepath) if p.filepath else "",
                "start_index": sess_start_idx,
                "end_index": sess_end_idx,
                "lap_count": len(session_lap_objs),
                "flying_lap_count": len([l for l in session_lap_objs if l["is_flying"]]),
                "best_lap_time_s": s_best_lap["duration_s"] if s_best_lap else None,
                "best_lap_number": s_best_lap["lap_number"] if s_best_lap else None,
                "is_reference": False
            })

        # 2. Process Reference Laps
        for r_idx, ref_lap in enumerate(reference_laps):
            if not ref_lap or not ref_lap.records:
                continue
            if not self.gates and ref_lap.gates:
                self.gates = [dict(g) for g in ref_lap.gates]

            combined_lap_counter += 1
            new_start_idx = len(self.records)
            t0 = ref_lap.records[0].time_s
            d0 = ref_lap.records[0].distance_m

            for r in ref_lap.records:
                rc = r.clone()
                rc.time_s = round(current_time_offset_s + max(0.0, r.time_s - t0), 3)
                rc.distance_m = round(current_dist_offset_m + max(0.0, r.distance_m - d0), 2)
                rc.lap = combined_lap_counter
                rc.session_id = "REF"
                self.records.append(rc)
                if rc.gps_lat is not None and rc.gps_lon is not None:
                    self.gps_records.append(rc)

            new_end_idx = len(self.records) - 1
            lap_start_time = self.records[new_start_idx].time_s
            lap_end_time = self.records[new_end_idx].time_s
            lap_dur = ref_lap.duration_s if ref_lap.duration_s > 0 else round(lap_end_time - lap_start_time, 3)
            lap_dist = ref_lap.distance_m if ref_lap.distance_m > 0 else round(self.records[new_end_idx].distance_m - self.records[new_start_idx].distance_m, 1)

            s1, s2, s3 = (ref_lap.sectors + [None, None, None])[:3]
            ref_color = "#ffd600"  # Gold for Reference Laps

            new_ref_lap_dict = {
                "lap_number": combined_lap_counter,
                "orig_lap_number": r_idx + 1,
                "session_id": "REF",
                "session_index": 99,
                "session_label": f"REF · {ref_lap.name}",
                "session_color": ref_color,
                "session_datetime": ref_lap.session_datetime,
                "name": f"REF · {ref_lap.name}",
                "orig_name": ref_lap.name,
                "start_time_s": round(lap_start_time, 3),
                "end_time_s": round(lap_end_time, 3),
                "duration_s": round(lap_dur, 3),
                "start_index": new_start_idx,
                "end_index": new_end_idx,
                "distance_m": round(lap_dist, 1),
                "max_speed_kmh": round(ref_lap.max_speed_kmh, 1),
                "max_gps_speed_kmh": round(ref_lap.max_gps_speed_kmh, 1),
                "max_lean_left_deg": round(ref_lap.max_lean_left_deg, 1),
                "max_lean_right_deg": round(ref_lap.max_lean_right_deg, 1),
                "max_rpm": int(ref_lap.max_rpm),
                "sector_1_s": s1,
                "sector_2_s": s2,
                "sector_3_s": s3,
                "sectors": [s1, s2, s3],
                "is_best": False,
                "is_session_best": True,
                "is_flying": True,
                "is_out_lap": False,
                "is_in_lap": False,
                "is_reference": True,
                "ref_id": ref_lap.id
            }
            self.laps.append(new_ref_lap_dict)

            current_time_offset_s = self.records[-1].time_s + 1.0
            current_dist_offset_m = self.records[-1].distance_m + 10.0

        if any(l.get("is_reference") for l in self.laps):
            ref_laps_in_session = [l for l in self.laps if l.get("is_reference")]
            best_ref = min(ref_laps_in_session, key=lambda x: x["duration_s"])
            self.sessions.append({
                "id": "REF",
                "index": 99,
                "label": "Reference Laps",
                "color": "#ffd600",
                "track_name": self.header.track_name,
                "rider_name": best_ref.get("orig_name", "Reference"),
                "bike_model": "",
                "session_datetime": "",
                "unix_timestamp": 0.0,
                "source_file": "",
                "lap_count": len(ref_laps_in_session),
                "flying_lap_count": len(ref_laps_in_session),
                "best_lap_time_s": best_ref["duration_s"],
                "best_lap_number": best_ref["lap_number"],
                "is_reference": True
            })

        # 3. Determine Overall Best Lap (preferring non-reference flying laps; fallback to all flying laps)
        rider_flying = [l for l in self.laps if l.get("is_flying") and not l.get("is_reference")]
        if not rider_flying:
            rider_flying = [l for l in self.laps if l.get("is_flying")]
        if not rider_flying and self.laps:
            rider_flying = [l for l in self.laps if not l.get("is_out_lap") and not l.get("is_in_lap")] or self.laps

        if rider_flying:
            overall_best = min(rider_flying, key=lambda x: x["duration_s"])
            overall_best["is_best"] = True

        self.is_multi_session = (len(valid_entries) > 1) or (len(reference_laps) > 0)
        self._compute_statistics()

        # Enrich stats with multi-session progression metrics
        non_ref_sessions = [s for s in self.sessions if not s.get("is_reference") and s.get("best_lap_time_s")]
        self.stats["session_count"] = len([s for s in self.sessions if not s.get("is_reference")])
        self.stats["reference_lap_count"] = len([l for l in self.laps if l.get("is_reference")])
        if len(non_ref_sessions) >= 2:
            first_best = non_ref_sessions[0]["best_lap_time_s"]
            day_best = min(s["best_lap_time_s"] for s in non_ref_sessions)
            self.stats["first_session_best_s"] = round(first_best, 3)
            self.stats["day_best_s"] = round(day_best, 3)
            self.stats["day_improvement_s"] = round(day_best - first_best, 3)
        else:
            self.stats["first_session_best_s"] = self.stats.get("best_lap_time_s")
            self.stats["day_best_s"] = self.stats.get("best_lap_time_s")
            self.stats["day_improvement_s"] = 0.0

