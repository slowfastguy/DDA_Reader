#!/usr/bin/env python3
"""
Cross-Platform Application Bundler for Ducati DDA Telemetry Reader.
Packages the PyQt6 application into double-clickable native executables:
- macOS: dist/Ducati DDA Reader.app
- Windows: dist/Ducati DDA Reader.exe
- Linux: dist/Ducati DDA Reader (standalone binary)
"""

import os
import sys
import subprocess

def main():
    print("=" * 60)
    print(" Ducati DDA Telemetry Reader - Executable Bundler")
    print("=" * 60)

    # Ensure PyInstaller is installed
    try:
        import PyInstaller
    except ImportError:
        print("[*] Installing PyInstaller...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])

    # Path separator for --add-data argument (':' on Unix/macOS, ';' on Windows)
    sep = ";" if sys.platform.startswith("win") else ":"
    data_viewer = f"viewer{sep}viewer"
    data_settings = f"dda_settings.json{sep}."

    mode_arg = "--onefile" if "--onefile" in sys.argv else ("--onedir" if "--onedir" in sys.argv else "--onefile")

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--name=Ducati DDA Reader",
        "--noconsole",
        "--windowed",
        "--clean",
        "--noconfirm",
        mode_arg,
        "--collect-all=libusb_package",
        "--collect-all=usb",
        f"--add-data={data_viewer}",
        f"--add-data={data_settings}",
        "dda_converter_gui.py"
    ]

    print(f"[*] Running PyInstaller command:\n    {' '.join(cmd)}\n")
    subprocess.check_call(cmd)

    print("\n" + "=" * 60)
    print("[+] BUILD COMPLETED SUCCESSFULLY!")
    print("=" * 60)
    if sys.platform == "darwin":
        print("  macOS App Bundle : dist/Ducati DDA Reader.app")
        print("  (You can double-click this .app in Finder or move it to /Applications)")
    elif sys.platform.startswith("win"):
        if mode_arg == "--onefile":
            print("  Windows Portable Executable: dist\\Ducati DDA Reader.exe")
        else:
            print("  Windows Directory Bundle   : dist\\Ducati DDA Reader\\Ducati DDA Reader.exe")
        print("  (Double-click in File Explorer to launch)")
    else:
        print("  Linux Executable  : dist/Ducati DDA Reader")
    print("=" * 60)

if __name__ == "__main__":
    main()
