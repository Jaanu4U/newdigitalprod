import sqlite3, json, os
DB = "/opt/digitalchain/backend/digitalchain.db"
if not os.path.exists(DB):
    print(json.dumps({"error":"db file missing","path":DB}))
    raise SystemExit(1)
conn = sqlite3.connect(DB)
cur = conn.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
tables = [r[0] for r in cur.fetchall()]
result = []
for t in tables:
    try:
        cur.execute(f"SELECT COUNT(*) FROM {t}")
        count = cur.fetchone()[0]
    except Exception as e:
        count = f"error: {e}"
    result.append({"table": t, "rows": count})
conn.close()
print(json.dumps(result))
