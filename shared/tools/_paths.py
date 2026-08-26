#!/usr/bin/env python3
"""
Where things live, now that the tooling is shared between apps.

    AVUI/
      shared/tools/          <- you are here
      shared/config/csv/     <- the GENERATED exports the build reads
      GDDs + Spreadsheets/   <- the workbook a human edits, and every GDD
      BATTLE SYSTEM/         <- an app
      MAP/                   <- an app

The workbook and the design documents live together because they are the same kind
of thing: what a person opens and edits. The CSVs are neither — they are what falls
out of the workbook on the way to `data.js`, so they stay next to the tooling.

Every script takes `--app "<name>"` to say which app it is acting on, defaulting to
BATTLE SYSTEM so old invocations keep working. The emotions table is the spine of
both systems and must never exist twice, which is why config is shared and only the
generated `data.js` is per-app.
"""
import os, sys

HERE   = os.path.dirname(os.path.abspath(__file__))          # AVUI/shared/tools
SHARED = os.path.abspath(os.path.join(HERE, ".."))           # AVUI/shared
AVUI   = os.path.abspath(os.path.join(HERE, "..", ".."))     # AVUI

DEFAULT_APP = "BATTLE SYSTEM"
BOOK_NAME   = "battle-system-config.xlsx"
DOCS_DIR    = "GDDs + Spreadsheets"

def take_app(argv=None):
    """Pull `--app NAME` out of argv (mutating it) and return the app name.
    Removing it means each script's own positional arguments still line up."""
    argv = sys.argv if argv is None else argv
    if "--app" in argv:
        i = argv.index("--app")
        name = argv[i + 1] if i + 1 < len(argv) else DEFAULT_APP
        del argv[i:i + 2]
        return name
    return os.environ.get("AVUI_APP", DEFAULT_APP)

def app_root(argv=None):
    return os.path.join(AVUI, take_app(argv))

def config_dir():
    return os.path.join(SHARED, "config")

def docs_dir():
    """Where documents live: every GDD, and the workbook a human actually edits."""
    return os.path.join(AVUI, DOCS_DIR)

def book_path():
    return os.path.join(docs_dir(), BOOK_NAME)

def csv_dir():
    return os.path.join(config_dir(), "csv")
