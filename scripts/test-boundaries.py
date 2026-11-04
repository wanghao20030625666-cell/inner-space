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
foreign_collection = str(uuid.uuid4())
foreign_project = str(uuid.uuid4())
ids = [str(uuid.uuid4()) for _ in range(205)]
with sqlite3.connect(database) as db:
    columns = '(id, owner, kind, title, content, tags, meta, created_at, updated_at)'
    sql = f'INSERT INTO records {columns} VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    db.execute(sql, (foreign_id, 'foreign-test-owner', 'note', label, 'foreign content', '[]', '{}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'))
    db.execute(sql, (foreign_project, 'foreign-test-owner', 'project', label, '', '[]', '{}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'))
    db.execute('INSERT INTO collections (id, owner, name, color, created_at) VALUES (?, ?, ?, ?, ?)', (foreign_collection, 'foreign-test-owner', label, 'green', '2026-01-01T00:00:00.000Z'))
    db.executemany(sql, [(i, 'local_seedy', 'note', label, 'pagination fixture', '[]', '{}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z') for i in ids])
    db.executemany('UPDATE records SET pinned = 1 WHERE id = ?', [(i,) for i in ids[:201]])
    db.executemany('UPDATE records SET tags = ? WHERE id = ?', [(json.dumps([label, 'last-page']), i) for i in ids[201:]])

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
    assert foreign_collection not in [c['id'] for c in first['collections']]
    import urllib.parse
    status, second = request('/api/space?q=' + label + '&cursor=' + urllib.parse.quote(first['nextCursor']))
    assert status == 200 and len(second['items']) == 5 and second['nextCursor'] is None
    assert len({r['id'] for r in first['items'] + second['items']}) == 205
    assert all(r['pinned'] for r in first['items'])
    assert len([r for r in second['items'] if r['pinned']]) == 1
    status, tagged = request('/api/space?q=' + label + '&tag=last-page')
    assert status == 200 and tagged['total'] == 4 and len(tagged['items']) == 4
    for path in ['/api/versions?id=' + foreign_id, '/api/files/' + foreign_id]:
        assert request(path)[0] == 404
    assert request('/api/space', 'PATCH', {'id': foreign_id, 'version': 1, 'title': 'forbidden'})[0] == 404
    assert request('/api/space', 'DELETE', {'id': foreign_id, 'version': 1})[0] == 404
    assert request('/api/space', 'POST', {'kind': 'event', 'title': label, 'dueAt': '2026-02-31'})[0] == 400
    assert request('/api/space?collection=' + foreign_collection)[1]['total'] == 0
    assert request('/api/collections', 'PATCH', {'id': foreign_collection, 'name': 'forbidden', 'color': 'green'})[0] == 404
    assert request('/api/collections', 'DELETE', {'id': foreign_collection})[0] == 404
    assert request('/api/space', 'POST', {'kind': 'note', 'title': label, 'collectionId': foreign_collection})[0] == 400
    assert request('/api/space', 'PATCH', {'id': ids[0], 'version': 1, 'collectionId': foreign_collection})[0] == 400
    assert request('/api/space', 'POST', {'kind': 'task', 'title': label, 'meta': {'projectId': foreign_project}})[0] == 400
    print(json.dumps({'status': 'passed', 'owner_isolation': True, 'collection_and_project_isolation': True, 'pagination_records': 205, 'mixed_pinned_cursor': True, 'server_tag_filter': True, 'invalid_calendar_date': 'rejected'}))
finally:
    with sqlite3.connect(database) as db:
        db.execute('DELETE FROM records WHERE title = ?', (label,))
        db.execute('DELETE FROM collections WHERE id = ?', (foreign_collection,))
