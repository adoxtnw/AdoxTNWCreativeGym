#!/bin/bash
# ============================================================================
#  DOUBLE-CLICK ME after editing the spreadsheet.
#
#  This is the whole answer to "can I change the numbers myself?" — yes. Edit
#  GDDs + Spreadsheets/battle-system-config.xlsx, save it, double-click this,
#  reload the game. That is the entire loop.
#
#  WHY A STEP IS NEEDED AT ALL. The game does not read the spreadsheet: it
#  reads data.js, which is generated from it. A browser cannot open an .xlsx,
#  and reading CSVs at runtime would break the prototype opening straight off
#  the disk (file:// forbids the fetch). So the workbook is compiled, and this
#  is the compiler.
#
#  IT ONLY EVER GOES ONE WAY: workbook -> CSV -> data.js. Nothing here writes
#  to the workbook, so your edits cannot be clobbered by running it.
#
#  THE ONE THING NOT TO RUN is tools/build_workbook.py. That regenerates the
#  workbook itself from the defaults written in Python — it is how the file was
#  created — and it would overwrite anything typed into it by hand. It is not
#  called from here, and there is no reason to call it unless you are adding a
#  whole new SHEET.
# ============================================================================
cd "$(dirname "$0")/shared/tools" || exit 1

echo "NEURO-METRO: AVUI — rebuilding the game's data from the spreadsheet"
echo

echo "1/2  reading the workbook  ->  CSV"
python3 export_csv.py || { echo; echo "FAILED. Is the workbook open in Excel? Close it and try again."; read -n1 -p "press any key"; exit 1; }

echo
echo "2/2  CSV  ->  data.js, for both apps"
python3 build_data.py --app MAP ../config/csv          || { echo "FAILED (map)";    read -n1 -p "press any key"; exit 1; }
python3 build_data.py --app "BATTLE SYSTEM" ../config/csv || { echo "FAILED (battle)"; read -n1 -p "press any key"; exit 1; }

echo
echo "Done. Reload the game — the browser is told not to cache, so a plain"
echo "refresh is enough."
echo
read -n1 -p "press any key to close"
