#!/usr/bin/env python3
import sys, sqlite3, json

def main():
    term = (sys.argv[1] if len(sys.argv) > 1 else '').strip().lower()
    if not term:
        print('Usage: check_org_settings.py <search-term>')
        sys.exit(1)
    db = '/opt/digitalchain/digitalchain.db'
    con = sqlite3.connect(db)
    con.row_factory = sqlite3.Row
    cur = con.cursor()
    like = f"%{term}%"
    rows = cur.execute(
        """
        select org_id, name, slug,
               json_extract(settings, '$.business.gstin') as gstin,
               json_extract(settings, '$.business') as business
        from organizations
        where lower(name) like ? or lower(slug) like ?
        order by name
        """,
        (like, like)
    ).fetchall()
    print(json.dumps([dict(r) for r in rows], indent=2))

if __name__ == '__main__':
    main()
