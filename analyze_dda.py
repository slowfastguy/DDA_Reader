"""
Ducati Data Analyzer (.dda) Raw Stream & GPS Deciphering Script
Run with: python analyze_dda.py
"""

import os
import struct
import xml.etree.ElementTree as ET
from collections import defaultdict

DDA_FILE = "Run045-192535-00.14.dda"
XML_FILE = "Run045-192535-00.14.xml"
DEF_FILE = "DDA_Definition.xml"

# Target GPS coordinate references
TARGET_LAT = 38.161944
TARGET_LON = -123.543888
LAT_INT32_E7 = int(TARGET_LAT * 1e7)       # 381619440 (0x16BD10F0)
LON_INT32_E7 = int(TARGET_LON * 1e7)       # -1235438880 (0xB652AADC)

def inspect_xml_definition(def_path):
    print("=" * 70)
    print(f"[*] Inspecting Definition XML: {def_path}")
    print("=" * 70)
    if not os.path.exists(def_path):
        print(f"[-] {def_path} not found.")
        return
    try:
        tree = ET.parse(def_path)
        root = tree.getroot()
        for bike in root.findall(".//Bike") or root.findall(".//Profile") or [root]:
            name = bike.get("Name", "Default")
            print(f"Profile / Bike: {name}")
            for ch in bike.findall(".//Channel") or bike.findall(".//Signal"):
                ch_name = ch.get("Name") or ch.text
                can_id = ch.get("ID") or ch.get("CanId") or ch.get("MessageId")
                unit = ch.get("Unit", "")
                print(f"  - Channel: {ch_name:<25} ID: {can_id:<8} Unit: {unit}")
    except Exception as e:
        print(f"[-] Error parsing definition XML: {e}")

def scan_raw_dda(file_path):
    print("\n" + "=" * 70)
    print(f"[*] Analyzing Raw DDA File: {file_path}")
    print("=" * 70)
    if not os.path.exists(file_path):
        print(f"[-] File not found: {file_path}")
        return

    file_size = os.path.getsize(file_path)
    print(f"[+] Total file size: {file_size:,} bytes ({file_size / 1024 / 1024:.2f} MB)")

    with open(file_path, "rb") as f:
        data = f.read()

    # 1. Print File Header Preview
    header_preview = data[:64]
    print(f"[+] Raw Header (Hex): {header_preview.hex(' ')}")
    print(f"[+] Raw Header (ASCII/Safe): {''.join(chr(b) if 32 <= b < 127 else '.' for b in header_preview)}")

    # 2. Search for Latitude and Longitude patterns in the entire binary
    print("\n[*] Searching for Target GPS Coordinate Bit Patterns...")
    
    # Lat/Lon search ranges (Tolerance ~ 0.05 degrees)
    lat_min_e7 = int((TARGET_LAT - 0.05) * 1e7)
    lat_max_e7 = int((TARGET_LAT + 0.05) * 1e7)
    lon_min_e7 = int((TARGET_LON - 0.05) * 1e7)
    lon_max_e7 = int((TARGET_LON + 0.05) * 1e7)

    gps_matches = []
    # Scan every 4-byte aligned and unaligned offset
    for offset in range(0, len(data) - 8, 1):
        # Test Little-Endian int32
        val_lat_le = struct.unpack_from("<i", data, offset)[0]
        if lat_min_e7 <= val_lat_le <= lat_max_e7:
            # Check if longitude follows immediately (offset + 4) or within 16 bytes
            for lon_offset in [offset + 4, offset + 8, offset - 4, offset - 8]:
                if 0 <= lon_offset <= len(data) - 4:
                    val_lon_le = struct.unpack_from("<i", data, lon_offset)[0]
                    if lon_min_e7 <= val_lon_le <= lon_max_e7:
                        gps_matches.append(("Int32*1e-7 (LE)", offset, lon_offset, val_lat_le * 1e-7, val_lon_le * 1e-7))

        # Test Big-Endian int32
        val_lat_be = struct.unpack_from(">i", data, offset)[0]
        if lat_min_e7 <= val_lat_be <= lat_max_e7:
            for lon_offset in [offset + 4, offset + 8, offset - 4, offset - 8]:
                if 0 <= lon_offset <= len(data) - 4:
                    val_lon_be = struct.unpack_from(">i", data, lon_offset)[0]
                    if lon_min_e7 <= val_lon_be <= lon_max_e7:
                        gps_matches.append(("Int32*1e-7 (BE)", offset, lon_offset, val_lat_be * 1e-7, val_lon_be * 1e-7))

        # Test Float32 (LE & BE)
        val_lat_flt_le = struct.unpack_from("<f", data, offset)[0]
        if 37.0 <= val_lat_flt_le <= 39.0:
            val_lon_flt_le = struct.unpack_from("<f", data, offset + 4)[0]
            if -124.0 <= val_lon_flt_le <= -122.0:
                gps_matches.append(("Float32 (LE)", offset, offset + 4, val_lat_flt_le, val_lon_flt_le))

    print(f"[+] Total GPS Candidate Matches Found: {len(gps_matches)}")
    if gps_matches:
        for m_type, lat_off, lon_off, lat_val, lon_val in gps_matches[:10]:
            print(f"    Format: {m_type:<15} Lat Offset: 0x{lat_off:06X} (Lat={lat_val:.6f}) | Lon Offset: 0x{lon_off:06X} (Lon={lon_val:.6f})")

    # 3. Detect Frame Cadence & Frame Size
    print("\n[*] Analyzing Packet Cadence & Frame Sync...")
    # Common Prosa DDA frame sizes: 10, 12, 14, 16, 20, 24, 32 bytes
    for frame_len in [8, 10, 12, 14, 16, 20, 24, 32]:
        sync_candidates = defaultdict(int)
        for i in range(0, min(len(data), 100000) - frame_len, frame_len):
            sync_byte = data[i]
            sync_candidates[sync_byte] += 1
        top_sync = sorted(sync_candidates.items(), key=lambda x: x[1], reverse=True)[:3]
        print(f"  Frame Size {frame_len:2d} bytes -> Top Header/Sync candidates: {top_sync}")

if __name__ == "__main__":
    inspect_xml_definition(DEF_FILE)
    scan_raw_dda(DDA_FILE)