"""Integration checks for owner isolation and pagination in the local D1 preview."""
from pathlib import Path
import json
import sqlite3
import urllib.request
import urllib.error
import uuid

root = Path(__file__).resolve().parents[1]
database = next(p for p in (root / '.wrangler/state/v3/d1').rglob('*.sqlite') if p.name != 'metadata.sqlite')
origin = 'http://127.0.0.1:5181'
label = 'boundary-' + uuid.uuid4().hex
foreign_id = str(uuid.uuid4())
ids = [str(uuid.uuid4()) for _ in range(205)]
with sqlite3.connect(database) as db:
    columns = '(id, owner, kind, title, content, tags, meta, created_at, updated_at)'
    sql = f'INSERT INTO records {columns} VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    db.execute(sql, (foreign_id, 'foreign-test-owner', 'note', label, 'foreign content', '[]', '{}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'))
    db.executemany(sql, [(i, 'local_seedy', 'note', label, 'pagination fixture', '[]', '{}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z') for i in ids])

def request(path, method='GET', value=None):
    req = urllib.request.Request(origin + path, data=None if value is None else json.dumps(value).encode(), method=method, headers={'Cookie': '__sites_local_auth=1', 'Origin': origin, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)

try:
    status, first = request('/api/space?q=' + label)
    assert status == 200 and len(first['items']) == 200
    assert foreign_id not in [r['id'] for r in first['items']]
    import urllib.parse
    status, second = request('/api/space?q=' + label + '&cursor=' + urllib.parse.quote(first['nextCursor']))
    assert status == 200 and len(second['items']) == 5 and second['nextCursor'] is None
    assert len({r['id'] for r in first['items'] + second['items']}) == 205
    for path in ['/api/versions?id=' + foreign_id, '/api/files/' + foreign_id]:
        assert request(path)[0] == 404
    assert request('/api/space', 'PATCH', {'id': foreign_id, 'version': 1, 'title': 'forbidden'})[0] == 404
    assert request('/api/space', 'DELETE', {'id': foreign_id, 'version': 1})[0] == 404
    assert request('/api/space', 'POST', {'kind': 'event', 'title': label, 'dueAt': '2026-02-31'})[0] == 400
    print(json.dumps({'status': 'passed', 'owner_isolation': True, 'pagination_records': 205, 'invalid_calendar_date': 'rejected'}))
finally:
    with sqlite3.connect(database) as db:
        db.execute('DELETE FROM records WHERE title = ?', (label,))
