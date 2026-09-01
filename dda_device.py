#!/usr/bin/env python3
"""
Ducati Data Analyzer (DDA) USB Hardware Device Driver & Downloader Utility.
Reverse-Engineered Communication Protocol for Prosa DDA USB Stick (VID: 0x1781, PID: 0x0B7B).

STRICTLY NON-DESTRUCTIVE & READ-ONLY:
  This module exclusively implements USB read commands to retrieve telemetry data,
  run listings, serial numbers, and acquisition channel tables from the physical stick.
  No write or erase commands are implemented or executed.

TRANSPORTS:
  1. WinUSB Native Transport (Windows): Direct zero-dependency ctypes interface to winusb.dll.
  2. LibUSB Transport (macOS / Linux / fallback): PyUSB + libusb-package interface.
"""

import os
import sys
import time
import struct
from datetime import datetime
from typing import List, Dict, Optional, Callable, Any

# USB Hardware Constants
DDA_VID = 0x1781
DDA_PID = 0x0B7B
DDA_GUID = "{044f0de0-4b4c-4247-b18a-4c8f1ffb67a8}"
EP_IN = 0x81
EP_OUT = 0x01
USB_TIMEOUT_MS = 4000

# Command Opcodes (Read-Only)
CMD_SERIAL = 0xCE
CMD_FLASH_ID = 0xD7
CMD_DACQ_INFO = 0xD3
CMD_LAST_ERROR = 0xD1
CMD_RUN_INFO_V4 = 0xDE
CMD_RUN_INFO_V3 = 0xDC
CMD_FLASH_READ = 0xC1
CMD_MICRO_READ = 0xD4

# Check for PyUSB / libusb
try:
    import libusb_package
    import usb.core
    import usb.util
    HAS_PYUSB = True
except ImportError:
    HAS_PYUSB = False

HAS_WINUSB = sys.platform.startswith("win")
HAS_USB = HAS_WINUSB or HAS_PYUSB


class DDARunInfo:
    """Metadata describing a single recording session stored on the DDA device."""
    def __init__(self, index: int, start_addr: int, byte_size: int, dt: Optional[datetime] = None):
        self.index = index
        self.start_addr = start_addr
        self.byte_size = byte_size
        self.datetime = dt
        self.duration_s = max(0.0, byte_size / 330.0)

    @property
    def datetime_str(self) -> str:
        if self.datetime:
            return self.datetime.strftime("%Y-%m-%d %H:%M")
        return "Unknown Date"

    @property
    def duration_str(self) -> str:
        mins = int(self.duration_s // 60)
        secs = int(self.duration_s % 60)
        return f"{mins}m {secs:02d}s"

    @property
    def size_kb(self) -> float:
        return self.byte_size / 1024.0

    def default_filename(self) -> str:
        if self.datetime:
            ts = self.datetime.strftime("%Y%m%d_%H%M%S")
            return f"Run{self.index:03d}_{ts}.dda"
        return f"Run{self.index:03d}.dda"

    def __repr__(self):
        return f"<DDARunInfo #{self.index}: {self.datetime_str} ({self.size_kb:.1f} KB, ~{self.duration_str})>"


class WinUsbTransport:
    """Native Windows WinUSB transport via ctypes (zero third-party dependencies)."""
    def __init__(self):
        import ctypes
        from ctypes import wintypes
        self.ctypes = ctypes
        self.wintypes = wintypes
        self.kernel32 = ctypes.windll.kernel32
        self.winusb = ctypes.windll.winusb
        self.h_file = None
        self.h_winusb = None

    @staticmethod
    def find_device_path() -> Optional[str]:
        """Finds the device interface path in the Windows registry."""
        import winreg
        key_path = rf"SYSTEM\CurrentControlSet\Control\DeviceClasses\{DDA_GUID}"
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path) as key:
                i = 0
                while True:
                    try:
                        subkey = winreg.EnumKey(key, i)
                        if "1781" in subkey.lower() or "0b7b" in subkey.lower():
                            if subkey.startswith("##?#"):
                                return r"\\?\\" + subkey[4:]
                            return subkey
                        i += 1
                    except OSError:
                        break
        except Exception:
            pass
        return None

    def is_present(self) -> bool:
        return self.find_device_path() is not None

    def open(self):
        if self.h_winusb:
            return
        path = self.find_device_path()
        if not path:
            raise ConnectionError("No Ducati Data Analyzer (DDA) USB stick found in Windows device manager.")

        GENERIC_READ = 0x80000000
        GENERIC_WRITE = 0x40000000
        FILE_SHARE_READ = 0x00000001
        FILE_SHARE_WRITE = 0x00000002
        OPEN_EXISTING = 3
        FILE_ATTRIBUTE_NORMAL = 0x80
        FILE_FLAG_OVERLAPPED = 0x40000000

        self.h_file = self.kernel32.CreateFileW(
            path,
            GENERIC_READ | GENERIC_WRITE,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            None,
            OPEN_EXISTING,
            FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OVERLAPPED,
            None
        )

        if self.h_file == -1 or self.h_file == 0xFFFFFFFFFFFFFFFF:
            err = self.kernel32.GetLastError()
            self.h_file = None
            if err == 5:
                raise PermissionError("Access Denied: The OEM 'DDA Downloader' or another process is holding exclusive lock.")
            raise ConnectionError(f"Failed to open DDA WinUSB device (WinError {err}).")

        h_winusb_val = self.wintypes.HANDLE()
        if not self.winusb.WinUsb_Initialize(self.h_file, self.ctypes.byref(h_winusb_val)):
            err = self.kernel32.GetLastError()
            self.kernel32.CloseHandle(self.h_file)
            self.h_file = None
            raise ConnectionError(f"Failed to initialize WinUSB handle (WinError {err}).")

        self.h_winusb = h_winusb_val

    def close(self):
        if self.h_winusb:
            try:
                self.winusb.WinUsb_Free(self.h_winusb)
            except Exception:
                pass
            self.h_winusb = None
        if self.h_file:
            try:
                self.kernel32.CloseHandle(self.h_file)
            except Exception:
                pass
            self.h_file = None

    def write(self, endpoint: int, data: bytes, timeout_ms: int = USB_TIMEOUT_MS) -> int:
        if not self.h_winusb:
            self.open()
        buf = (self.ctypes.c_ubyte * len(data))(*data)
        bytes_written = self.wintypes.ULONG()
        if not self.winusb.WinUsb_WritePipe(self.h_winusb, endpoint, buf, len(data), self.ctypes.byref(bytes_written), None):
            err = self.kernel32.GetLastError()
            raise IOError(f"WinUsb_WritePipe failed (WinError {err})")
        return bytes_written.value

    def read(self, endpoint: int, max_len: int = 512, timeout_ms: int = USB_TIMEOUT_MS) -> bytes:
        if not self.h_winusb:
            self.open()
        buf = (self.ctypes.c_ubyte * max_len)()
        bytes_read = self.wintypes.ULONG()
        if not self.winusb.WinUsb_ReadPipe(self.h_winusb, endpoint, buf, max_len, self.ctypes.byref(bytes_read), None):
            err = self.kernel32.GetLastError()
            raise IOError(f"WinUsb_ReadPipe failed (WinError {err})")
        return bytes(buf[:bytes_read.value])


class PyUsbTransport:
    """Cross-platform PyUSB + libusb transport."""
    def __init__(self):
        self.dev = None

    def is_present(self) -> bool:
        if not HAS_PYUSB:
            return False
        try:
            dev = libusb_package.find(idVendor=DDA_VID, idProduct=DDA_PID)
            return dev is not None
        except Exception:
            return False

    def open(self):
        if self.dev is not None:
            return
        if not HAS_PYUSB:
            raise RuntimeError("PyUSB / libusb-package not installed.")
        self.dev = libusb_package.find(idVendor=DDA_VID, idProduct=DDA_PID)
        if self.dev is None:
            raise ConnectionError("No DDA USB device found.")
        try:
            usb.util.claim_interface(self.dev, 0)
        except Exception as e:
            raise ConnectionError(f"Failed to claim USB interface: {e}") from e

    def close(self):
        if self.dev is not None:
            try:
                usb.util.release_interface(self.dev, 0)
            except Exception:
                pass
            self.dev = None

    def write(self, endpoint: int, data: bytes, timeout_ms: int = USB_TIMEOUT_MS) -> int:
        if self.dev is None:
            self.open()
        return self.dev.write(endpoint, data, timeout=timeout_ms)

    def read(self, endpoint: int, max_len: int = 512, timeout_ms: int = USB_TIMEOUT_MS) -> bytes:
        if self.dev is None:
            self.open()
        return bytes(self.dev.read(endpoint, max_len, timeout=timeout_ms))


class DDADevice:
    """
    Hardware communication manager for the Ducati Data Analyzer USB logger stick.
    Provides non-destructive read operations to list and download runs.
    """
    def __init__(self):
        if HAS_WINUSB:
            self.transport = WinUsbTransport()
        else:
            self.transport = PyUsbTransport()
        self._serial_number: Optional[str] = None
        self._flash_id: Optional[bytes] = None
        self._daq_table_cache: Optional[bytes] = None

    @staticmethod
    def is_oem_downloader_running() -> bool:
        """Checks if the official DDA Downloader background process is active on Windows."""
        if sys.platform != "win32":
            return False
        try:
            import subprocess
            out = subprocess.check_output(
                ['tasklist', '/FI', 'IMAGENAME eq dda-downloader.exe'],
                text=True, stderr=subprocess.DEVNULL
            )
            return "dda-downloader.exe" in out.lower()
        except Exception:
            return False

    @staticmethod
    def kill_oem_downloader() -> bool:
        """Terminates the official DDA Downloader to release the exclusive USB interface."""
        if sys.platform != "win32":
            return True
        try:
            import subprocess
            subprocess.run(['taskkill', '/F', '/IM', 'dda-downloader.exe'], capture_output=True)
            time.sleep(0.5)
            return True
        except Exception:
            return False

    def is_connected(self) -> bool:
        """Checks if a DDA stick is currently plugged in and detectable."""
        return self.transport.is_present()

    def connect(self):
        """Opens and claims the USB interface of the DDA stick."""
        try:
            self.transport.open()
        except PermissionError as e:
            if self.is_oem_downloader_running():
                raise PermissionError(
                    "The OEM 'DDA Downloader' is running in the system tray and holding exclusive access.\n"
                    "Please close DDA Downloader from the system tray, or click 'Close OEM Downloader'."
                ) from e
            raise e

    def disconnect(self):
        """Safely releases the USB interface."""
        self.transport.close()

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.disconnect()

    def get_serial_number(self) -> str:
        """Retrieves the hardware serial number of the DDA device."""
        if self._serial_number:
            return self._serial_number

        self.connect()
        try:
            cmd = bytes([0x03, 0x00, CMD_SERIAL])
            self.transport.write(EP_OUT, cmd, timeout_ms=USB_TIMEOUT_MS)
            resp = self.transport.read(EP_IN, 64, timeout_ms=USB_TIMEOUT_MS)

            if resp and resp[0] == 0x0F:
                raw_bytes = resp[1:]
                try:
                    serial = raw_bytes.decode('utf-16le').strip('\x00').strip()
                    if serial and serial.isprintable():
                        self._serial_number = serial
                        return serial
                except Exception:
                    pass
                self._serial_number = raw_bytes.decode('latin1', errors='ignore').strip('\x00').strip()
                return self._serial_number
        finally:
            self.disconnect()

        return "Unknown"

    def get_flash_info(self) -> Dict[str, Any]:
        """Queries the hardware flash chip ID and geometry."""
        self.connect()
        try:
            cmd = bytes([0x03, 0x00, CMD_FLASH_ID])
            self.transport.write(EP_OUT, cmd, timeout_ms=USB_TIMEOUT_MS)
            resp = self.transport.read(EP_IN, 64, timeout_ms=USB_TIMEOUT_MS)

            if resp and resp[0] == 0x17:
                flash_bytes = resp[1:]
                return {
                    "raw_id": flash_bytes.hex(' '),
                    "manufacturer_id": hex(resp[1]) if len(resp) > 1 else "Unknown",
                    "device_id": hex(resp[2]) if len(resp) > 2 else "Unknown"
                }
        finally:
            self.disconnect()
        return {"raw_id": "Unknown"}

    def list_runs(self) -> List[DDARunInfo]:
        """
        Scans all recording runs stored on the stick (strictly read-only).
        Returns a list of DDARunInfo instances.
        """
        self.connect()
        runs: List[DDARunInfo] = []

        try:
            cmd_code = CMD_RUN_INFO_V4
            for r_idx in range(256):
                cmd = bytes([0x05, 0x00, cmd_code, r_idx & 0xFF, (r_idx >> 8) & 0xFF])
                self.transport.write(EP_OUT, cmd, timeout_ms=USB_TIMEOUT_MS)
                resp = self.transport.read(EP_IN, 64, timeout_ms=USB_TIMEOUT_MS)

                if not resp or resp[0] != 0x04:
                    if r_idx == 0 and cmd_code == CMD_RUN_INFO_V4:
                        cmd_code = CMD_RUN_INFO_V3
                        cmd = bytes([0x05, 0x00, cmd_code, 0, 0])
                        self.transport.write(EP_OUT, cmd, timeout_ms=USB_TIMEOUT_MS)
                        resp = self.transport.read(EP_IN, 64, timeout_ms=USB_TIMEOUT_MS)
                        if not resp or resp[0] != 0x04:
                            break
                    else:
                        break

                start_addr = struct.unpack_from('<I', resp, 1)[0]
                byte_size = struct.unpack_from('<I', resp, 5)[0]

                dt = None
                try:
                    minute = resp[14] if len(resp) > 14 else 0
                    hour = resp[15] if len(resp) > 15 else 0
                    if hour >= 24:
                        hour = hour % 24

                    date_val = struct.unpack_from('<H', resp, 20)[0] if len(resp) >= 22 else 0
                    if date_val > 0:
                        al = date_val & 0xFF
                        ah = (date_val >> 8) & 0xFF
                        year = (ah >> 1) + 2000
                        if year > 2035:
                            year = year - 14
                        month = (((ah & 1) << 3) | (al >> 5)) + 1
                        if not (1 <= month <= 12):
                            month = max(1, min(12, month % 12 + 1))
                        day = max(1, min(31, al & 0x1F))
                        dt = datetime(year, month, day, hour, minute)
                except Exception:
                    dt = None

                runs.append(DDARunInfo(r_idx, start_addr, byte_size, dt))
        finally:
            self.disconnect()

        return runs

    def download_acquisition_table(self) -> bytes:
        """
        Reads the hardware channel acquisition definition table from microcontroller flash (cmd 0xD4).
        """
        if self._daq_table_cache:
            return self._daq_table_cache

        self.connect()
        try:
            cmd = bytes([0x03, 0x00, CMD_DACQ_INFO])
            self.transport.write(EP_OUT, cmd, timeout_ms=USB_TIMEOUT_MS)
            resp = self.transport.read(EP_IN, 64, timeout_ms=USB_TIMEOUT_MS)

            if not resp or resp[0] != 0x13:
                raise RuntimeError(f"Failed to query DAQ table info: {list(resp)}")

            dacq_addr = struct.unpack_from('<I', resp, 1)[0]
            dacq_size = struct.unpack_from('<I', resp, 5)[0]

            buffer = bytearray()
            while len(buffer) < dacq_size:
                curr_addr = dacq_addr + len(buffer)
                read_cmd = bytes([
                    0x07, 0x00, CMD_MICRO_READ,
                    curr_addr & 0xFF, (curr_addr >> 8) & 0xFF,
                    (curr_addr >> 16) & 0xFF, (curr_addr >> 24) & 0xFF
                ])
                self.transport.write(EP_OUT, read_cmd, timeout_ms=USB_TIMEOUT_MS)
                chunk_resp = self.transport.read(EP_IN, 512, timeout_ms=USB_TIMEOUT_MS)
                if not chunk_resp or chunk_resp[0] != 0x14:
                    break
                buffer.extend(chunk_resp[1:])

            self._daq_table_cache = bytes(buffer[:dacq_size])
            return self._daq_table_cache
        finally:
            self.disconnect()

    def download_raw_run_data(
        self,
        run_info: DDARunInfo,
        progress_callback: Optional[Callable[[int, int, float], None]] = None
    ) -> bytes:
        """
        Reads raw flash data for a given run block by block using command 0xC1.
        Progress callback receives: (downloaded_bytes, total_bytes, speed_kb_s).
        """
        self.connect()
        total_len = run_info.byte_size
        buffer = bytearray()
        start_time = time.time()

        try:
            while len(buffer) < total_len:
                curr_addr = run_info.start_addr + len(buffer)
                read_cmd = bytes([
                    0x07, 0x00, CMD_FLASH_READ,
                    curr_addr & 0xFF, (curr_addr >> 8) & 0xFF,
                    (curr_addr >> 16) & 0xFF, (curr_addr >> 24) & 0xFF
                ])
                self.transport.write(EP_OUT, read_cmd, timeout_ms=USB_TIMEOUT_MS)
                chunk_resp = self.transport.read(EP_IN, 512, timeout_ms=USB_TIMEOUT_MS)

                if not chunk_resp or chunk_resp[0] != 0x05:
                    raise IOError(f"Error reading flash data at {hex(curr_addr)}: code {chunk_resp[0] if chunk_resp else 'None'}")

                payload = chunk_resp[1:]
                buffer.extend(payload)

                if progress_callback:
                    elapsed = max(0.001, time.time() - start_time)
                    speed_kb_s = (len(buffer) / 1024.0) / elapsed
                    progress_callback(min(len(buffer), total_len), total_len, speed_kb_s)

            return bytes(buffer[:total_len])
        finally:
            self.disconnect()

    def assemble_dda_file(
        self,
        run_info: DDARunInfo,
        raw_acq_data: bytes,
        daq_table_data: Optional[bytes] = None,
        track_name: str = "",
        rider_name: str = ""
    ) -> bytes:
        """
        Constructs a complete native DDA v4 container (.dda) combining:
        - 4 Header Entries (DDA, INF, DAQ, ACQ)
        - INF Metadata Block (Track, Rider, Timestamps)
        - DAQ Acquisition Channel Table Block
        - ACQ Raw Binary Telemetry Data Block
        """
        if daq_table_data is None:
            daq_table_data = self.download_acquisition_table()

        header_entries = bytearray()
        header_entries.extend(b'DDA\x00' + struct.pack('>H', 3) + struct.pack('<I', 2))
        inf_offset = 42
        header_entries.extend(b'INF\x00' + struct.pack('>H', 1) + struct.pack('<I', inf_offset))
        daq_offset = inf_offset + 264
        header_entries.extend(b'DAQ\x00' + struct.pack('>H', 1) + struct.pack('<I', daq_offset))
        acq_offset = daq_offset + len(daq_table_data)
        header_entries.extend(b'ACQ\x00' + struct.pack('>H', 1) + struct.pack('<I', acq_offset))

        file_buf = bytearray()
        file_buf.extend(struct.pack('<H', 4))
        file_buf.extend(header_entries)

        if len(file_buf) < inf_offset:
            file_buf.extend(b'\x00' * (inf_offset - len(file_buf)))

        inf_block = bytearray(264)
        if track_name:
            t_bytes = track_name.encode('latin1', errors='ignore')[:47]
            inf_block[0:len(t_bytes)] = t_bytes
        if rider_name:
            r_bytes = rider_name.encode('latin1', errors='ignore')[:43]
            inf_block[64:64+len(r_bytes)] = r_bytes

        file_buf.extend(inf_block)
        file_buf.extend(daq_table_data)
        file_buf.extend(raw_acq_data)

        return bytes(file_buf)

    def download_run_to_file(
        self,
        run_info: DDARunInfo,
        destination_folder: str = "downloads",
        filename: Optional[str] = None,
        progress_callback: Optional[Callable[[int, int, float], None]] = None,
        track_name: str = "",
        rider_name: str = ""
    ) -> str:
        """
        Downloads the specified run and writes the native .dda file to disk.
        Returns the absolute filepath of the saved file.
        """
        os.makedirs(destination_folder, exist_ok=True)
        if not filename:
            filename = run_info.default_filename()

        out_path = os.path.join(destination_folder, filename)

        # 1. Download DAQ table first (if not cached)
        daq_data = self.download_acquisition_table()

        # 2. Download raw ACQ data
        raw_acq = self.download_raw_run_data(run_info, progress_callback)

        # 3. Assemble .dda container
        dda_bytes = self.assemble_dda_file(run_info, raw_acq, daq_data, track_name, rider_name)

        with open(out_path, 'wb') as f:
            f.write(dda_bytes)

        return os.path.abspath(out_path)


# =====================================================================
# Standalone Interactive CLI Interface
# =====================================================================

def _format_progress_bar(current: int, total: int, speed_kb_s: float, bar_width: int = 35) -> str:
    pct = (current / total) if total > 0 else 1.0
    filled = int(round(bar_width * pct))
    bar = "█" * filled + "░" * (bar_width - filled)
    return f"\r  [{bar}] {pct*100:5.1f}% ({current/1024:.1f}/{total/1024:.1f} KB at {speed_kb_s:.1f} KB/s)"


def run_standalone_cli():
    """Interactive command-line interface for listing and downloading runs."""
    print("=" * 70)
    print("  DUCATI DATA ANALYZER (DDA) USB DOWNLOADER")
    print("  Safe, Read-Only Telemetry Extraction Utility")
    print("=" * 70)

    device = DDADevice()

    if device.is_oem_downloader_running():
        print("\n[!] Notice: OEM 'DDA Downloader' is running in the background.")
        ans = input("    Close DDA Downloader now to allow USB access? [Y/n]: ").strip().lower()
        if ans not in ['n', 'no']:
            device.kill_oem_downloader()
            print("    DDA Downloader closed.")
        else:
            print("    Cannot proceed while OEM downloader has exclusive USB lock.")
            sys.exit(1)

    print("\nScanning USB buses for DDA stick...")
    if not device.is_connected():
        print("[!] No DDA USB stick detected.")
        print("    Please ensure the device is firmly plugged into a USB port.")
        sys.exit(1)

    try:
        serial = device.get_serial_number()
        flash = device.get_flash_info()
        print(f"[✓] Connected to DDA Stick!")
        print(f"    Serial Number : {serial}")
        print(f"    Flash Chip ID : {flash.get('raw_id', 'Unknown')}")

        print("\nReading session index from device memory...")
        runs = device.list_runs()

        if not runs:
            print("[!] No recorded runs found on this device.")
            sys.exit(0)

        print(f"\nFound {len(runs)} Recorded Run(s) on Stick:\n")
        print(f"  {'#':<4} | {'Date & Time':<17} | {'Size':<12} | {'Est. Duration':<14} | {'Start Addr':<12}")
        print("  " + "-" * 66)
        for r in runs:
            print(f"  {r.index:<4} | {r.datetime_str:<17} | {r.size_kb:>8.1f} KB | {r.duration_str:>14} | {hex(r.start_addr):<12}")

        print("\nOptions:")
        print("  - Enter run numbers separated by spaces (e.g. '0 1 4')")
        print("  - Enter 'all' to download all recorded runs")
        print("  - Enter 'q' to quit without downloading")

        choice = input("\nSelect runs to download [default: all]: ").strip()
        if choice.lower() in ['q', 'quit', 'exit']:
            print("Operation cancelled.")
            sys.exit(0)

        selected_runs = []
        if not choice or choice.lower() == 'all':
            selected_runs = runs
        else:
            indices = []
            for part in choice.replace(',', ' ').split():
                if part.isdigit():
                    indices.append(int(part))
            selected_runs = [r for r in runs if r.index in indices]

        if not selected_runs:
            print("[!] No valid runs selected.")
            sys.exit(0)

        dest = input("\nEnter destination directory [default: ./downloads]: ").strip()
        if not dest:
            dest = "downloads"

        print(f"\nDownloading {len(selected_runs)} run(s) to: {os.path.abspath(dest)}\n")

        for idx, r in enumerate(selected_runs, start=1):
            fname = r.default_filename()
            print(f"[{idx}/{len(selected_runs)}] Downloading Run #{r.index:02d} ({r.datetime_str}, {r.size_kb:.1f} KB)...")

            def on_progress(cur, tot, spd):
                sys.stdout.write(_format_progress_bar(cur, tot, spd))
                sys.stdout.flush()

            saved_file = device.download_run_to_file(r, destination_folder=dest, progress_callback=on_progress)
            print(f"\n      Saved: {saved_file}\n")

        print("=" * 70)
        print(f"[✓] Successfully downloaded {len(selected_runs)} native .dda file(s)!")
        print(f"    Location: {os.path.abspath(dest)}")
        print("=" * 70)

    except Exception as e:
        print(f"\n[!] Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        device.disconnect()


if __name__ == "__main__":
    run_standalone_cli()
