from pathlib import Path

from backend.storage import PackageFile, editor_files, pack_zip


def skill_upload(client, **fields):
    data = pack_zip({"sample/SKILL.md": PackageFile(b"---\nname: sample\ndescription: synthetic\n---\nOnly synthetic.")})
    return client.post("/api/skills/import", files={"file": ("sample.zip", data, "application/zip")}, data=fields)


def native_suite():
    return {str(path.relative_to("examples/label-text")): PackageFile(path.read_bytes())
            for path in Path("examples/label-text/evals").rglob("*") if path.is_file()}


def test_identity_dedup_and_conflict(admin):
    first = skill_upload(admin).json()
    conflict = skill_upload(admin)
    assert conflict.status_code == 409
    duplicate = skill_upload(admin, skill_id=first["skill"]["id"])
    assert duplicate.status_code == 200
    assert duplicate.json()["deduplicated"]
    independent = skill_upload(admin, independent="true").json()
    assert independent["skill"]["id"] != first["skill"]["id"]


def test_draft_edit_publish_and_immutable_history(admin):
    uploaded = skill_upload(admin).json()
    created = admin.post(f"/api/skills/{uploaded['skill']['id']}/sets", json={
        "source_skill_version_id": uploaded["version"]["id"], "files": editor_files(native_suite())})
    assert created.status_code == 200, created.text
    draft = created.json()["version"]
    set_id = created.json()["set_id"]
    assert draft["validation"]["valid"], draft["validation"]
    detail = admin.get(f"/api/set-versions/{draft['id']}").json()
    files = detail["files"]
    files["evals/cases/label-basic.yaml"]["content"] += "\nx-extra: preserved\n"
    changed = admin.put(f"/api/set-versions/{draft['id']}", json={"expected_edit_number": 1, "files": files})
    assert changed.status_code == 200
    assert admin.put(f"/api/set-versions/{draft['id']}", json={"expected_edit_number": 1, "files": files}).status_code == 409
    saved = admin.post(f"/api/set-versions/{draft['id']}/save", json={"expected_edit_number": 2})
    assert saved.status_code == 200, saved.text
    saved = saved.json()
    assert admin.post(f"/api/sets/{set_id}/activate", json={"version_id": saved["id"]}).status_code == 200
    assert admin.put(f"/api/set-versions/{saved['id']}", json={"expected_edit_number": 1, "files": files}).status_code == 409
    export = admin.get(f"/api/set-versions/{saved['id']}/export")
    preview = admin.post("/api/sets/preview-import", files={"file": ("set.zip", export.content, "application/zip")})
    assert preview.status_code == 200, preview.text
    assert preview.json()["files"] == files
    fork = admin.post(f"/api/sets/{set_id}/drafts", json={"source_version_id": saved["id"]}).json()
    assert fork["blob"] == saved["blob"]
    assert admin.delete(f"/api/set-versions/{saved['id']}").status_code == 409


def test_invalid_suite_stays_draft(admin):
    uploaded = skill_upload(admin).json()
    created = admin.post(f"/api/skills/{uploaded['skill']['id']}/sets", json={
        "source_skill_version_id": uploaded["version"]["id"],
        "files": editor_files({"evals/eval.yaml": PackageFile(b"broken: [")})}).json()
    draft = created["version"]
    assert not draft["validation"]["valid"]
    assert admin.post(f"/api/set-versions/{draft['id']}/save", json={"expected_edit_number": 1}).status_code == 422


def test_directory_preview_and_json_conversion(admin):
    import json

    files = native_suite()
    paths = ['chosen/' + name for name in files]
    response = admin.post('/api/sets/preview-import-directory',
                          data={'paths': json.dumps(paths)},
                          files=[('files', (Path(name).name, file.data)) for name, file in files.items()])
    assert response.status_code == 200, response.text
    assert response.json()['files'] == editor_files(files)
    assert response.json()['validation']['valid']
    assert admin.post('/api/skills/import-directory', data={'paths': '[["bad"]]'}, files={'files': ('x', b'content')}).status_code == 422
    converted = admin.post('/api/sets/preview-import', files={'file': ('evals.json', json.dumps({'evals': [{'id': 'a', 'prompt': 'Reply OK', 'expectations': ['Output OK']}]}))})
    assert converted.status_code == 200, converted.text
    assert converted.json()['notes'][0]['message']
    assert converted.json()['validation']['valid']
