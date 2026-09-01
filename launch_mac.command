#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

# Launch bundled .app if present, else fallback to python
if [ -d "$DIR/dist/Ducati DDA Reader.app" ]; then
    open "$DIR/dist/Ducati DDA Reader.app"
else
    python3 dda_converter_gui.py
fi
