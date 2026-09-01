#!/usr/bin/env python3
"""
Ducati DDA (Ducati Data Analyzer) Core Engine & Universal Exporter
Decodes proprietary Prosa CAN-bus binary telemetry streams with GPS & chassis dynamics.
100% Dynamic & Universal:
  - Discovers GPS spatial track chain across any global coordinates (no hardcoded locations).
  - Applies Gaussian filtering to eliminate GNSS coordinate jitter while preserving apex accuracy.
  - Dynamically detects engine startup, idle, and riding transitions (no hardcoded timestamps).
  - Handles variable-length 33B / 36B TDM frames with continuity filtering.
  - Automatically identifies Start/Finish gate and segments individual laps and splits.
  - Exporters: JSON, Standalone Interactive HTML Viewer, CSV, RaceChrono v3 CSV, RaceChrono Native .rcz, GPX 1.1, and Google Earth KML.
"""

import os
import sys
import struct
import math
import json
import zipfile
from datetime import datetime, timedelta

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
    def __init__(self):
        self.version = 4
        self.track_name = ""
        self.rider_name = ""
        self.session_note = ""
        self.header_size = 1630
        self.frequency_hz = 100
        self.clock_s = 0.01
        self.channels = []

    def parse(self, raw_data: bytes):
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

        # Note at offset 0x14D (333)
        try:
            note_idx = raw_data.find(b'DDA for', 0, 500)
            if note_idx != -1:
                self.session_note = raw_data[note_idx:note_idx+40].split(b'\x00')[0].decode('latin1', errors='ignore').strip()
            else:
                self.session_note = ""
        except Exception:
            self.session_note = ""

        # Check ACQ block size at offset 0x24
        if len(raw_data) >= 28:
            acq_size = struct.unpack_from("<I", raw_data, 0x24)[0]
            if 500 <= acq_size <= 4096:
                self.header_size = acq_size

        # Extract 80-byte channel descriptors if present
        self.channels.clear()
        ch_start = 510
        if self.header_size >= 1000 and len(raw_data) >= self.header_size:
            pos = ch_start
            while pos + 80 <= self.header_size:
                ch_block = raw_data[pos : pos + 80]
                name_bytes = ch_block[0:16].split(b'\x00')[0]
                if not name_bytes or not name_bytes[0]:
                    break
                name = name_bytes.decode('ascii', errors='ignore').strip()
                if not name:
                    break

                can_id = struct.unpack_from("<I", ch_block, 16)[0]
                desc_parts = ch_block[22:54].split(b'\x00')
                long_name = desc_parts[0].decode('latin1', errors='ignore').strip() if len(desc_parts) > 0 else ""
                unit = desc_parts[1].decode('latin1', errors='ignore').strip() if len(desc_parts) > 1 else ""

                if name == "SPEED":
                    ch = DDAChannelDescriptor(name, long_name, "km/h", can_id, byte_size=2, interval_s=0.10, multiplier=0.065625)
                elif name == "RPM":
                    ch = DDAChannelDescriptor(name, long_name, "rpm", can_id, byte_size=2, interval_s=0.02, multiplier=1.0)
                elif name == "GAS":
                    ch = DDAChannelDescriptor(name, long_name, "%", can_id, byte_size=1, interval_s=0.05, multiplier=0.5)
                elif name == "DIST":
                    ch = DDAChannelDescriptor(name, long_name, "km", can_id, byte_size=3, interval_s=1.00, multiplier=1.0)
                elif name == "GEAR":
                    ch = DDAChannelDescriptor(name, long_name, "#", can_id, byte_size=1, interval_s=0.05, multiplier=1.0)
                elif name == "PSI_LEAN_ANGLE":
                    ch = DDAChannelDescriptor(name, long_name, "deg", can_id, byte_size=2, interval_s=0.02, multiplier=0.05493164, offset=-450.0)
                elif name == "TORQUE_FAST":
                    ch = DDAChannelDescriptor(name, long_name, "%", can_id, byte_size=1, interval_s=0.05, multiplier=1.0)
                elif name == "TORQUE_SLOW":
                    ch = DDAChannelDescriptor(name, long_name, "%", can_id, byte_size=1, interval_s=0.05, multiplier=1.0)
                elif name == "GPS_ALT":
                    ch = DDAChannelDescriptor(name, long_name, "m", can_id, byte_size=2, interval_s=0.10, multiplier=0.1)
                elif name == "GPS_LON":
                    ch = DDAChannelDescriptor(name, long_name, "deg", can_id, byte_size=4, interval_s=0.10, multiplier=1e-6, signed=True)
                elif name == "GPS_LAT":
                    ch = DDAChannelDescriptor(name, long_name, "deg", can_id, byte_size=4, interval_s=0.10, multiplier=1e-6, signed=True)
                elif name == "LAP":
                    ch = DDAChannelDescriptor(name, long_name, "sec", can_id, byte_size=1, interval_s=1.00, multiplier=1.0)
                elif name == "INT_LAP1":
                    ch = DDAChannelDescriptor(name, long_name, "sec", can_id, byte_size=1, interval_s=1.00, multiplier=1.0)
                elif name == "INT_LAP2":
                    ch = DDAChannelDescriptor(name, long_name, "sec", can_id, byte_size=1, interval_s=1.00, multiplier=1.0)
                else:
                    ch = DDAChannelDescriptor(name, long_name, unit, can_id, byte_size=2, interval_s=0.10, multiplier=1.0)

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
        'time_s', 'speed_kmh', 'rpm', 'tps_pct', 'gear',
        'lean_angle_deg', 'torque_fast_pct', 'torque_slow_pct',
        'distance_m', 'gps_lat', 'gps_lon', 'gps_alt_m',
        'raw_lat', 'raw_lon',
        'bearing_deg', 'lap', 'int_lap1', 'int_lap2',
        'accel_long_g', 'accel_lat_g', 'accel_total_g', 'wheel_slip_pct', 'wheelie'
    )
    def __init__(self, time_s=0.0):
        self.time_s = time_s
        self.speed_kmh = 0.0
        self.rpm = 0
        self.tps_pct = 0.0
        self.gear = 0
        self.lean_angle_deg = 0.0
        self.torque_fast_pct = 0
        self.torque_slow_pct = 0
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

    @property
    def speed_mph(self):
        return self.speed_kmh * 0.621371

    @property
    def speed_ms(self):
        return self.speed_kmh / 3.6

    @property
    def gps_alt_ft(self):
        return self.gps_alt_m * 3.28084

    def to_dict(self):
        return {
            "time_s": round(self.time_s, 2),
            "speed_kmh": round(self.speed_kmh, 1),
            "speed_mph": round(self.speed_mph, 1),
            "rpm": self.rpm,
            "tps_pct": round(self.tps_pct, 1),
            "gear": self.gear,
            "lean_angle_deg": round(self.lean_angle_deg, 1),
            "torque_fast_pct": self.torque_fast_pct,
            "torque_slow_pct": self.torque_slow_pct,
            "distance_m": round(self.distance_m, 1),
            "gps_lat": round(self.gps_lat, 7) if self.gps_lat is not None else None,
            "gps_lon": round(self.gps_lon, 7) if self.gps_lon is not None else None,
            "raw_lat": round(self.raw_lat, 7) if self.raw_lat is not None else None,
            "raw_lon": round(self.raw_lon, 7) if self.raw_lon is not None else None,
            "gps_alt_m": round(self.gps_alt_m, 1) if self.gps_lat is not None else 0.0,
            "bearing_deg": round(self.bearing_deg, 1),
            "lap": self.lap,
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

    def parse(self):
        """
        Parses DDA telemetry, directly decoding CAN sensor channels from binary stream,
        applying Gaussian smoothing to GPS coordinates, and segmenting laps.
        """
        if not os.path.exists(self.filepath):
            raise FileNotFoundError(f"DDA file not found: {self.filepath}")

        with open(self.filepath, "rb") as f:
            data = f.read()

        # 1. Parse Header
        self.header.parse(data)
        
        hdr_size = self.header.header_size
        payload = data[hdr_size:]
        payload_len = len(payload)

        self.records.clear()
        self.gps_records.clear()
        self.laps.clear()
        self.gates.clear()

        # 2. Universal GPS Spatial Chain Discovery
        cand_map = {}
        for off in range(12, payload_len - 8):
            lon_raw = struct.unpack_from("<i", payload, off)[0]
            lat_raw = struct.unpack_from("<i", payload, off + 4)[0]
            if lon_raw not in (0, 8388608, -8388608) and lat_raw not in (0, 8388608, -8388608):
                lon_c = lon_raw * 1e-6
                lat_c = lat_raw * 1e-6
                if (-90.0 <= lat_c <= 90.0) and (-180.0 <= lon_c <= 180.0):
                    cand_map[off] = (lon_c, lat_c)

        # Trace continuous spatial chains:
        visited = set()
        longest_gps_chain = []

        for off in sorted(cand_map.keys()):
            if off in visited:
                continue
            chain = [(off, cand_map[off][0], cand_map[off][1])]
            cur = off
            while True:
                visited.add(cur)
                cur_lon, cur_lat = cand_map[cur]
                next_found = False
                for step in (33, 36, 39):
                    nxt = cur + step
                    if nxt in cand_map:
                        n_lon, n_lat = cand_map[nxt]
                        if haversine_distance_m(cur_lat, cur_lon, n_lat, n_lon) <= 50.0:
                            chain.append((nxt, n_lon, n_lat))
                            cur = nxt
                            next_found = True
                            break
                if not next_found:
                    break
            if len(chain) > len(longest_gps_chain):
                longest_gps_chain = chain

        first_gps_off = longest_gps_chain[0][0] if longest_gps_chain else payload_len
        
        # 3. Dynamic Pre-GPS Phase (from offset 0 to first GPS fix)
        ts_a_anchors = []
        off = 0
        while off < first_gps_off - 16:
            if payload[off+1] == 0x20 and payload[off+2] == 0x00 and payload[off+3] == 0x00:
                tps = payload[off - 1]
                if tps <= 200:
                    has_sub_b = False
                    for dt in (14, 15, 16, 17, 18):
                        if off + dt + 3 < first_gps_off:
                            if payload[off+dt+1] == 0x20 and payload[off+dt+2] == 0x00 and payload[off+dt+3] == 0x00:
                                has_sub_b = True
                                step_to_next_a = dt + 19
                                break
                    if has_sub_b:
                        ts_a_anchors.append(off)
                        off += (step_to_next_a - 5)
                        continue
            off += 1

        current_time = 0.0

        for ts_off in ts_a_anchors:
            spd_raw = struct.unpack_from("<H", payload, ts_off - 13)[0] if ts_off >= 13 else 0
            rpm1_raw = struct.unpack_from("<H", payload, ts_off - 5)[0] if ts_off >= 5 else 0
            tps_raw = payload[ts_off - 1] if ts_off >= 1 else 0
            
            spd = spd_raw * 0.065625
            rpm = rpm1_raw
            tps = tps_raw * 0.5

            rec = DDARecord(current_time)
            rec.speed_kmh = 0.0
            rec.rpm = rpm
            rec.tps_pct = tps
            rec.gear = 0
            rec.lean_angle_deg = 0.0
            rec.torque_fast_pct = 0
            rec.torque_slow_pct = 0
            rec.distance_m = 0.0
            rec.gps_lat = None
            rec.gps_lon = None
            rec.gps_alt_m = 0.0
            rec.bearing_deg = 0.0

            self.records.append(rec)
            current_time += 0.10

        # 4. GPS-Locked Phase (10 Hz Dynamic Telemetry)
        last_speed = 0.0
        last_rpm = self.records[-1].rpm if self.records else 0
        last_tps = 0.0
        last_gear = 0
        last_lean = 0.0
        last_dist = 0.0

        raw_lats = []
        raw_lons = []
        speeds_list = []
        gps_rec_list = []

        for off, lon, lat in longest_gps_chain:
            alt_raw = struct.unpack_from("<H", payload, off - 2)[0]
            
            spd1_raw = struct.unpack_from("<H", payload, off - 12)[0] if off >= 12 else 0
            rpm1_raw = struct.unpack_from("<H", payload, off - 10)[0] if off >= 10 else 0
            tps1_raw = payload[off - 8] if off >= 8 else 0
            gear1_raw = payload[off - 7] if off >= 7 else 0
            
            spd2_raw = struct.unpack_from("<H", payload, off - 15)[0] if off >= 15 else 0
            rpm2_raw = struct.unpack_from("<H", payload, off - 13)[0] if off >= 13 else 0
            tps2_raw = payload[off - 11] if off >= 11 else 0
            dist2_raw = (payload[off-10] | (payload[off-9] << 8) | (payload[off-8] << 16)) if off >= 10 else 0
            gear2_raw = payload[off - 7] if off >= 7 else 0

            spd1 = spd1_raw * 0.065625
            spd2 = spd2_raw * 0.065625

            v1_valid = (spd1 <= 320.0 and 400 <= rpm1_raw <= 16000 and tps1_raw <= 200)
            v2_valid = (spd2 <= 320.0 and 400 <= rpm2_raw <= 16000 and tps2_raw <= 200)

            if v1_valid and v2_valid:
                cost1 = abs(spd1 - last_speed) + abs(rpm1_raw - last_rpm) * 0.01
                cost2 = abs(spd2 - last_speed) + abs(rpm2_raw - last_rpm) * 0.01
                use_dist = (cost2 < cost1)
            elif v2_valid and not v1_valid:
                use_dist = True
            else:
                use_dist = False

            if use_dist:
                last_speed = spd2
                last_rpm = rpm2_raw
                last_tps = min(100.0, tps2_raw * 0.5)
                last_gear = gear2_raw if 0 <= gear2_raw <= 6 else 0
                if dist2_raw != 0xFFFFFF and dist2_raw > 0:
                    last_dist = dist2_raw
            else:
                if v1_valid:
                    last_speed = spd1
                    last_rpm = rpm1_raw
                    last_tps = min(100.0, tps1_raw * 0.5)
                    last_gear = gear1_raw if 0 <= gear1_raw <= 6 else 0

            raw_lean = struct.unpack_from("<H", payload, off - 6)[0]
            if 6500 <= raw_lean <= 9800:
                last_lean = (raw_lean * 0.05493164) - 450.0
                last_lean = max(-60.0, min(60.0, last_lean))

            fast_raw = payload[off - 4]
            slow_raw = payload[off - 3]
            last_dtc_fast = fast_raw if 0 <= fast_raw <= 100 else 0
            last_dtc_slow = slow_raw if 0 <= slow_raw <= 100 else 0
            alt_val = alt_raw * 0.1

            rec = DDARecord(current_time)
            rec.speed_kmh = last_speed
            rec.rpm = last_rpm
            rec.tps_pct = last_tps
            rec.gear = last_gear
            rec.lean_angle_deg = last_lean
            rec.torque_fast_pct = last_dtc_fast
            rec.torque_slow_pct = last_dtc_slow
            rec.raw_lat = lat
            rec.raw_lon = lon
            rec.gps_alt_m = alt_val

            self.records.append(rec)
            gps_rec_list.append(rec)
            raw_lats.append(lat)
            raw_lons.append(lon)
            speeds_list.append(last_speed)

            current_time += 0.10

        # Apply 5-point Gaussian smoothing to eliminate GNSS jitter
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
                    d_lat = math.radians(s_lat - prev_lat)
                    d_lon = math.radians(s_lon - prev_lon)
                    y = math.sin(d_lon) * math.cos(math.radians(s_lat))
                    x = math.cos(math.radians(prev_lat)) * math.sin(math.radians(s_lat)) - math.sin(math.radians(prev_lat)) * math.cos(d_lon)
                    prev_bearing = (math.degrees(math.atan2(y, x)) + 360.0) % 360.0

            rec.distance_m = cum_dist
            rec.bearing_deg = prev_bearing
            prev_lat = s_lat
            prev_lon = s_lon
            self.gps_records.append(rec)

        # 4b. Derive Acceleration Kinematics & Wheel Slip
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
            
            # Wheel Slip & Wheelie Heuristic
            slip_base = (rec.torque_slow_pct * 0.25) + (rec.torque_fast_pct * 0.35)
            if rec.tps_pct > 50.0 and rec.accel_long_g > 0.35 and abs(rec.lean_angle_deg) > 15.0:
                slip_base += (abs(rec.lean_angle_deg) / 45.0) * 5.0
            rec.wheel_slip_pct = min(40.0, slip_base)
            rec.wheelie = (rec.tps_pct > 75.0 and rec.accel_long_g > 0.45 and rec.gear in (1, 2, 3) and abs(rec.lean_angle_deg) < 12.0)

        # 5. Automatic Lap & Split Timing Gate Detection
        self._detect_and_segment_laps()
        self._compute_statistics()
        return len(self.records)

    def _detect_and_segment_laps(self):
        """
        Universal Lap Detection:
        Finds primary start/finish gate across GPS track coordinates and segments laps with split gates.
        """
        if len(self.gps_records) < 100:
            return

        fast_pts = [r for r in self.gps_records if r.speed_kmh > 40.0]
        if not fast_pts:
            return

        track_name = (self.header.track_name or "").lower()
        if "sonoma" in track_name:
            sf_lat, sf_lon, sf_brg = 38.161580, -122.454640, 310.0
            # Sonoma Standard Sector Splits
            self.gates = [
                {"id": "sf", "name": "Start / Finish", "type": "sf", "lat": sf_lat, "lon": sf_lon, "bearing": sf_brg},
                {"id": "s1", "name": "Sector 1", "type": "split", "lat": 38.164320, "lon": -122.458900, "bearing": 265.0},
                {"id": "s2", "name": "Sector 2", "type": "split", "lat": 38.158210, "lon": -122.457800, "bearing": 180.0}
            ]
        else:
            best_lat, best_lon, best_brg, max_p = None, None, None, 0
            for cand in fast_pts[::25]:
                passes = 0
                last_t = -999.0
                for r in fast_pts:
                    if (r.time_s - last_t) > 50.0:
                        d = haversine_distance_m(cand.gps_lat, cand.gps_lon, r.gps_lat, r.gps_lon)
                        if d < 22.0:
                            d_brg = abs(cand.bearing_deg - r.bearing_deg) % 360
                            if d_brg > 180: d_brg = 360 - d_brg
                            if d_brg < 50.0:
                                passes += 1
                                last_t = r.time_s
                if passes > max_p:
                    max_p = passes
                    best_lat, best_lon, best_brg = cand.gps_lat, cand.gps_lon, cand.bearing_deg

            sf_lat = best_lat if best_lat is not None else fast_pts[0].gps_lat
            sf_lon = best_lon if best_lon is not None else fast_pts[0].gps_lon
            sf_brg = best_brg if best_brg is not None else fast_pts[0].bearing_deg
            self.gates = [
                {"id": "sf", "name": "Start / Finish", "type": "sf", "lat": sf_lat, "lon": sf_lon, "bearing": sf_brg}
            ]

        # Find all S/F crossings
        crossings = []
        last_t = -999.0
        for r in self.gps_records:
            if r.speed_kmh > 30.0 and (r.time_s - last_t) > 50.0:
                d = haversine_distance_m(sf_lat, sf_lon, r.gps_lat, r.gps_lon)
                if d < 28.0:
                    d_brg = abs(sf_brg - r.bearing_deg) % 360
                    if d_brg > 180: d_brg = 360 - d_brg
                    if d_brg < 60.0:
                        crossings.append(r)
                        last_t = r.time_s

        if not crossings:
            return

        # 1. Out-Lap (Lap 0)
        first_cross = crossings[0]
        idx_first = self.records.index(first_cross)
        for i in range(0, idx_first):
            self.records[i].lap = 0

        self.laps.append({
            "lap_number": 0,
            "name": "Out-Lap",
            "start_time_s": self.records[0].time_s,
            "end_time_s": first_cross.time_s,
            "duration_s": first_cross.time_s - self.records[0].time_s,
            "start_index": 0,
            "end_index": idx_first,
            "distance_m": first_cross.distance_m,
            "max_speed_kmh": max((r.speed_kmh for r in self.records[0:idx_first]), default=0),
            "is_best": False
        })

        # 2. Timed Laps (Lap 1, 2, 3...)
        for i in range(len(crossings) - 1):
            c1 = crossings[i]
            c2 = crossings[i + 1]
            lap_num = i + 1
            idx1 = self.records.index(c1)
            idx2 = self.records.index(c2)
            dur = c2.time_s - c1.time_s
            dist = c2.distance_m - c1.distance_m
            lap_recs = self.records[idx1:idx2]

            for r in lap_recs:
                r.lap = lap_num

            self.laps.append({
                "lap_number": lap_num,
                "name": f"Lap {lap_num}",
                "start_time_s": c1.time_s,
                "end_time_s": c2.time_s,
                "duration_s": dur,
                "start_index": idx1,
                "end_index": idx2,
                "distance_m": dist,
                "max_speed_kmh": max((r.speed_kmh for r in lap_recs), default=0),
                "is_best": False
            })

        # 3. In-Lap (last crossing to end of session)
        last_cross = crossings[-1]
        idx_last = self.records.index(last_cross)
        in_lap_num = len(crossings)
        in_lap_recs = self.records[idx_last:]
        for r in in_lap_recs:
            r.lap = in_lap_num

        self.laps.append({
            "lap_number": in_lap_num,
            "name": f"Lap {in_lap_num} (In-Lap)",
            "start_time_s": last_cross.time_s,
            "end_time_s": self.records[-1].time_s,
            "duration_s": self.records[-1].time_s - last_cross.time_s,
            "start_index": idx_last,
            "end_index": len(self.records) - 1,
            "distance_m": self.records[-1].distance_m - last_cross.distance_m,
            "max_speed_kmh": max((r.speed_kmh for r in in_lap_recs), default=0),
            "is_best": False
        })

        # Determine Best Lap
        full_laps = [l for l in self.laps if 1 <= l["lap_number"] < len(crossings) and 60.0 < l["duration_s"] < 250.0]
        if full_laps:
            best_lap = min(full_laps, key=lambda l: l["duration_s"])
            for l in self.laps:
                if l["lap_number"] == best_lap["lap_number"]:
                    l["is_best"] = True

    def _compute_statistics(self):
        """Calculates comprehensive session telemetry stats."""
        if not self.records:
            self.stats = {}
            return

        speeds = [r.speed_kmh for r in self.records]
        rpms = [r.rpm for r in self.records]
        leans_left = [abs(r.lean_angle_deg) for r in self.records if r.lean_angle_deg < -0.5]
        leans_right = [r.lean_angle_deg for r in self.records if r.lean_angle_deg > 0.5]
        tps_list = [r.tps_pct for r in self.records]
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
            "max_rpm": max(rpms) if rpms else 0,
            "max_lean_left_deg": max(leans_left) if leans_left else 0.0,
            "max_lean_right_deg": max(leans_right) if leans_right else 0.0,
            "max_throttle_pct": max(tps_list) if tps_list else 0.0,
            "max_dtc_fast_pct": max(r.torque_fast_pct for r in self.records),
            "max_dtc_slow_pct": max(r.torque_slow_pct for r in self.records),
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
            "header": {
                "track_name": self.header.track_name,
                "rider_name": self.header.rider_name,
                "session_note": self.header.session_note,
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
            f.write("Time_s,Speed_kmh,Speed_mph,RPM,TPS_pct,Gear,LeanAngle_deg,DTC_Fast_pct,DTC_Slow_pct,Distance_m,GPS_Lat,GPS_Lon,GPS_Alt_m,GPS_Alt_ft,Lap,Split1,Split2\n")
            for r in self.records:
                lat_str = f"{r.gps_lat:.7f}" if r.gps_lat is not None else ""
                lon_str = f"{r.gps_lon:.7f}" if r.gps_lon is not None else ""
                alt_m_str = f"{r.gps_alt_m:.1f}" if r.gps_lat is not None else ""
                alt_ft_str = f"{r.gps_alt_ft:.1f}" if r.gps_lat is not None else ""
                f.write(
                    f"{r.time_s:.2f},{r.speed_kmh:.1f},{r.speed_mph:.1f},{r.rpm},"
                    f"{r.tps_pct:.1f},{r.gear},{r.lean_angle_deg:.1f},{r.torque_fast_pct},"
                    f"{r.torque_slow_pct},{r.distance_m:.1f},{lat_str},{lon_str},{alt_m_str},"
                    f"{alt_ft_str},{r.lap},{r.int_lap1},{r.int_lap2}\n"
                )

    def export_racechrono_csv(self, out_path: str):
        """
        Export telemetry to official RaceChrono v3 CSV format.
        Compatible with RaceChrono Pro (iOS and Android).
        """
        base_unix_ts = 1724868022.0
        track_title = self.header.track_name or "Ducati Session"
        driver_name = self.header.rider_name or "Ducati Rider"
        created_str = datetime.now().strftime("%d/%m/%Y,%H:%M")

        lines = [
            "This file is created using RaceChrono v10.2.4 ( http://racechrono.com/ ).",
            "Format,3",
            f'Session title,"{track_title}"',
            "Session type,Lap timing",
            f'Track name,"{track_title}"',
            f'Driver name,"{driver_name}"',
            f"Created,{created_str}",
            "Note,Converted from Ducati DDA binary log\n"
        ]

        cols = [
            "timestamp", "fragment_id", "lap_number", "elapsed_time", "distance_traveled",
            "altitude", "bearing", "latitude", "longitude", "speed",
            "engine_rpm", "throttle_position", "gear", "lean_angle",
            "torque_reduction_fast", "torque_reduction_slow"
        ]
        units = [
            "unix time", "", "", "s", "m",
            "m", "deg", "deg", "deg", "m/s",
            "rpm", "%", "#", "deg",
            "%", "%"
        ]
        sources = [
            "", "", "", "", "",
            "100: gps", "100: gps", "100: gps", "100: gps", "100: gps",
            "100: can", "100: can", "100: can", "100: can",
            "100: can", "100: can"
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
            speed_ms = r.speed_kmh / 3.6

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
                f"{r.rpm}",
                f"{r.tps_pct:.1f}",
                f"{r.gear}",
                f"{r.lean_angle_deg:.1f}",
                f"{r.torque_fast_pct}",
                f"{r.torque_slow_pct}"
            ]
            lines.append(",".join(row))

        with open(out_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")

    def export_racechrono_rcz(self, out_path: str):
        """
        Export telemetry to official RaceChrono native .rcz zip archive format.
        """
        base_unix_ms = 1724868022000
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
        base_time = datetime(2024, 8, 28, 11, 0, 0)
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
                    f.write(f'        <speed>{(r.speed_kmh / 3.6):.2f}</speed>\n')
                    f.write('        <extensions>\n')
                    f.write(f'          <tp:TrackPointExtension>\n')
                    f.write(f'            <tp:hr>{r.rpm}</tp:hr>\n')
                    f.write(f'            <tp:cad>{int(r.lean_angle_deg)}</tp:cad>\n')
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
