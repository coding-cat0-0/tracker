import sqlite3
from pathlib import Path

db_path = Path("table1.db")
if not db_path.exists():
    print("Database not found")
    exit(1)

conn = sqlite3.connect(str(db_path))
cur = conn.cursor()

# Delete all bad timesheet rows (don't deserve corrupted data)
cur.execute("DELETE FROM timesheet")
conn.commit()

# Verify
count = cur.execute("SELECT COUNT(*) FROM timesheet").fetchone()[0]
print(f"Timesheet table cleaned. Remaining rows: {count}")

conn.close()
