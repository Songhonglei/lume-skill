from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel, Field

from backend.common import db_connection, digest, jsonb, new_id, required
from backend.security import get_admin
from backend.storage import (
    MAX_ARCHIVE,
    PackageError,
    PackageFile,
    editor_files,
    find_skill,
    from_editor,
    pack_zip,
    unpack_zip,
    validate_files,
)
from backend.validation import normalize_suite, validate_suite

router = APIRouter(prefix="/api", tags=["resources"], dependencies=[Depends(get_admin)])


def read_upload(file: UploadFile) -> bytes:
    content = file.file.read(MAX_ARCHIVE + 1)
    if len(content) > MAX_ARCHIVE:
        raise HTTPException(413, "上传文件超过 100 MiB")
    return content


def manifest(files: dict[str, PackageFile]) -> list[dict]:
    return [{"path": path, "size": len(file.data), "sha256": digest(file.data), "mode": file.mode}
            for path, file in sorted(files.items())]


def create_draft(connection, store, set_id, source_skill_version_id, files, original_blob=None, validation=None):
    connection.execute("SELECT id FROM evaluation_sets WHERE id=%s FOR UPDATE", (set_id,))
    revision = connection.execute("SELECT coalesce(max(revision),0)+1 AS n FROM set_versions WHERE set_id=%s", (set_id,)).fetchone()["n"]
    blob = store.put(pack_zip(files))
    return connection.execute(
        """INSERT INTO set_versions(id,set_id,source_skill_version_id,kind,revision,blob,original_blob,validation)
           VALUES(%s,%s,%s,'DRAFT',%s,%s,%s,%s) RETURNING *""",
        (new_id(), set_id, source_skill_version_id, revision, blob, original_blob, jsonb(validation or {}))).fetchone()


def import_skill(files, original, request, connection, *, skill_id=None, independent=False, selected_root=None):
    store = request.app.state.store
    normalized, metadata = find_skill(files, selected_root)
    name = metadata["name"] or "未命名 Skill"
    original_blob = store.put(original)
    blob = store.put(pack_zip(normalized))
    if skill_id:
        skill = required(connection.execute("SELECT * FROM skills WHERE id=%s FOR UPDATE", (skill_id,)).fetchone())
        if skill["archived"]:
            raise HTTPException(409, "已归档的 Skill 不能添加版本")
    else:
        # Serialize name-collision decisions; names still never become identities.
        connection.execute("SELECT pg_advisory_xact_lock(684913292)")
        matches = connection.execute("SELECT id,name FROM skills WHERE name=%s AND NOT archived", (name,)).fetchall()
        if matches and not independent:
            raise HTTPException(409, {"message": "发现同名 Skill，请选择新增版本或创建独立 Skill", "matches": matches})
        skill = connection.execute("INSERT INTO skills(id,name,description) VALUES(%s,%s,%s) RETURNING *",
                                   (new_id(), name, metadata["description"])).fetchone()
    existing = connection.execute("SELECT * FROM skill_versions WHERE skill_id=%s AND blob=%s", (skill["id"], blob)).fetchone()
    if existing:
        return {"skill": skill, "version": existing, "deduplicated": True}
    revision = connection.execute("SELECT coalesce(max(revision),0)+1 AS n FROM skill_versions WHERE skill_id=%s", (skill["id"],)).fetchone()["n"]
    version = connection.execute(
        """INSERT INTO skill_versions(id,skill_id,revision,declared_version,blob,original_blob,manifest)
           VALUES(%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
        (new_id(), skill["id"], revision, metadata["version"], blob, original_blob, jsonb(manifest(normalized)))).fetchone()
    imported_draft = None
    has_set = connection.execute("SELECT 1 FROM evaluation_sets WHERE skill_id=%s", (skill["id"],)).fetchone()
    if not has_set and ("evals/eval.yaml" in normalized or "evals/evals.json" in normalized or "evals.json" in normalized):
        try:
            suite_files, notes = normalize_suite(normalized)
            validation = validate_suite(suite_files, request.app.state.settings.skill_up)
            validation["import_notes"] = notes
            set_id = new_id()
            connection.execute("INSERT INTO evaluation_sets(id,skill_id,name) VALUES(%s,%s,%s)",
                               (set_id, skill["id"], "随 Skill 导入的评测集"))
            connection.execute("UPDATE skills SET default_set_id=%s WHERE id=%s", (set_id, skill["id"]))
            imported_draft = create_draft(connection, store, set_id, version["id"], suite_files, original_blob, validation)
        except PackageError as error:
            # An invalid bundled suite is still existing work, never permission to regenerate.
            suite_files = {name if name.startswith("evals/") else "evals/" + name: file
                           for name, file in normalized.items() if name.startswith("evals/") or name == "evals.json"}
            set_id = new_id()
            connection.execute("INSERT INTO evaluation_sets(id,skill_id,name) VALUES(%s,%s,%s)",
                               (set_id, skill["id"], "待整理的案例草稿"))
            connection.execute("UPDATE skills SET default_set_id=%s WHERE id=%s", (set_id, skill["id"]))
            imported_draft = create_draft(connection, store, set_id, version["id"], suite_files, original_blob,
                                         {"valid": False, "issues": [{"path": "evals", "message": str(error)}], "cases": []})
    return {"skill": skill, "version": version, "deduplicated": False, "imported_draft": imported_draft}


@router.post("/skills/import")
def upload_skill(request: Request, file: Annotated[UploadFile, File()],
                 skill_id: Annotated[UUID | None, Form()] = None,
                 independent: Annotated[bool, Form()] = False,
                 root: Annotated[str | None, Form()] = None, connection=Depends(db_connection)):
    data = read_upload(file)
    return import_skill(unpack_zip(data), data, request, connection,
                        skill_id=skill_id, independent=independent, selected_root=root)


@router.post("/skills/import-directory")
def upload_directory(request: Request, files: Annotated[list[UploadFile], File()],
                     paths: Annotated[str, Form()], skill_id: Annotated[UUID | None, Form()] = None,
                     independent: Annotated[bool, Form()] = False,
                     root: Annotated[str | None, Form()] = None, connection=Depends(db_connection)):
    try:
        names = json.loads(paths)
    except ValueError as error:
        raise HTTPException(422, "目录文件清单不是有效 JSON") from error
    if not isinstance(names, list) or not all(isinstance(name, str) for name in names) or len(names) != len(files) or len(set(names)) != len(names):
        raise HTTPException(422, "目录文件清单与上传文件不一致，或包含重复路径")
    package = validate_files({name: PackageFile(read_upload(file)) for name, file in zip(names, files, strict=True)})
    return import_skill(package, pack_zip(package), request, connection,
                        skill_id=skill_id, independent=independent, selected_root=root)


@router.get("/skills")
def list_skills(connection=Depends(db_connection)):
    return connection.execute(
        """SELECT s.*,v.id AS latest_version_id,v.revision AS latest_revision,v.declared_version,
                  e.name AS default_set_name,e.active_version_id,sv.validation AS active_validation,
                  sv.source_skill_version_id AS active_source_skill_version_id,
                  (SELECT count(*) FROM evaluation_sets es WHERE es.skill_id=s.id AND NOT es.archived) AS set_count,
                  (SELECT count(*) FROM set_versions d JOIN evaluation_sets es ON es.id=d.set_id
                   WHERE es.skill_id=s.id AND d.kind='DRAFT' AND NOT d.archived AND NOT es.archived) AS draft_count
           FROM skills s LEFT JOIN LATERAL
           (SELECT * FROM skill_versions WHERE skill_id=s.id ORDER BY revision DESC LIMIT 1) v ON true
           LEFT JOIN evaluation_sets e ON e.id=s.default_set_id AND NOT e.archived
           LEFT JOIN set_versions sv ON sv.id=e.active_version_id
           WHERE NOT s.archived ORDER BY s.created_at DESC""").fetchall()


@router.get("/examples/label-text.zip")
def example_package():
    root = Path(__file__).resolve().parent.parent / "examples/label-text"
    files = {str(path.relative_to(root)): PackageFile(path.read_bytes()) for path in root.rglob("*") if path.is_file()}
    return Response(pack_zip(files), media_type="application/zip",
                    headers={"Content-Disposition": 'attachment; filename="label-text.zip"'})


@router.get("/skills/{skill_id}")
def skill_detail(skill_id: UUID, connection=Depends(db_connection)):
    skill = required(connection.execute("SELECT * FROM skills WHERE id=%s", (skill_id,)).fetchone())
    versions = connection.execute("SELECT * FROM skill_versions WHERE skill_id=%s ORDER BY revision DESC", (skill_id,)).fetchall()
    sets = connection.execute("SELECT e.*,v.validation AS active_validation,v.source_skill_version_id AS active_source_skill_version_id FROM evaluation_sets e LEFT JOIN set_versions v ON v.id=e.active_version_id WHERE e.skill_id=%s AND NOT e.archived ORDER BY e.created_at", (skill_id,)).fetchall()
    return {**skill, "versions": versions, "sets": sets}


@router.get("/skill-versions/{version_id}/download")
def download_skill(version_id: UUID, request: Request, original: bool = False, connection=Depends(db_connection)):
    version = required(connection.execute("SELECT * FROM skill_versions WHERE id=%s", (version_id,)).fetchone())
    return Response(request.app.state.store.get(version["original_blob" if original else "blob"]),
                    media_type="application/zip", headers={"Content-Disposition": 'attachment; filename="skill.zip"'})


@router.post("/sets/preview-import")
def preview_suite(request: Request, file: Annotated[UploadFile, File()], connection=Depends(db_connection)):
    data = read_upload(file)
    files = {"evals.json": PackageFile(data)} if (file.filename or "").endswith(".json") else unpack_zip(data)
    normalized, notes = normalize_suite(files)
    return {"files": editor_files(normalized), "original_blob": request.app.state.store.put(data),
            "notes": notes, "validation": validate_suite(normalized, request.app.state.settings.skill_up)}


@router.post("/sets/preview-import-directory")
def preview_suite_directory(request: Request, files: Annotated[list[UploadFile], File()],
                            paths: Annotated[str, Form()], connection=Depends(db_connection)):
    try:
        names = json.loads(paths)
    except ValueError as error:
        raise HTTPException(422, "目录文件清单不是有效 JSON") from error
    if not isinstance(names, list) or not all(isinstance(name, str) for name in names) or len(names) != len(files) or len(set(names)) != len(names):
        raise HTTPException(422, "目录文件清单与上传文件不一致，或包含重复路径")
    package = validate_files({name: PackageFile(read_upload(file)) for name, file in zip(names, files, strict=True)})
    normalized, notes = normalize_suite(package)
    return {"files": editor_files(normalized), "original_blob": request.app.state.store.put(pack_zip(package)),
            "notes": notes, "validation": validate_suite(normalized, request.app.state.settings.skill_up)}


class EditorFile(BaseModel):
    encoding: str
    content: str
    mode: int = 0o644


class NewSet(BaseModel):
    source_skill_version_id: UUID
    name: str = Field(default="默认评测集", min_length=1, max_length=120)
    files: dict[str, EditorFile]
    original_blob: str | None = None


@router.post("/skills/{skill_id}/sets")
def new_set(skill_id: UUID, body: NewSet, request: Request, connection=Depends(db_connection)):
    skill = required(connection.execute("SELECT * FROM skills WHERE id=%s FOR UPDATE", (skill_id,)).fetchone())
    required(connection.execute("SELECT id FROM skill_versions WHERE id=%s AND skill_id=%s", (body.source_skill_version_id, skill_id)).fetchone(), "来源版本不属于当前 Skill")
    if body.original_blob:
        request.app.state.store.get(body.original_blob)
    files = from_editor({name: value.model_dump() for name, value in body.files.items()})
    set_id = new_id()
    connection.execute("INSERT INTO evaluation_sets(id,skill_id,name) VALUES(%s,%s,%s)", (set_id, skill_id, body.name))
    if skill["default_set_id"] is None:
        connection.execute("UPDATE skills SET default_set_id=%s WHERE id=%s", (set_id, skill_id))
    version = create_draft(connection, request.app.state.store, set_id, body.source_skill_version_id,
                           files, body.original_blob, validate_suite(files, request.app.state.settings.skill_up))
    return {"set_id": set_id, "version": version}


@router.get("/sets")
def list_sets(skill_id: UUID | None = None, connection=Depends(db_connection)):
    return connection.execute(
        """SELECT e.*,s.name AS skill_name,s.default_set_id=e.id AS is_default,v.revision AS active_revision,
                  v.validation AS active_validation,
                  (SELECT count(*) FROM set_versions d WHERE d.set_id=e.id AND d.kind='DRAFT' AND NOT d.archived) AS draft_count
           FROM evaluation_sets e JOIN skills s ON s.id=e.skill_id LEFT JOIN set_versions v ON v.id=e.active_version_id
           WHERE NOT e.archived AND (%s::uuid IS NULL OR e.skill_id=%s) ORDER BY e.created_at DESC""",
        (skill_id, skill_id)).fetchall()


@router.get("/sets/{set_id}")
def set_detail(set_id: UUID, connection=Depends(db_connection)):
    item = required(connection.execute("SELECT e.*,s.name AS skill_name FROM evaluation_sets e JOIN skills s ON s.id=e.skill_id WHERE e.id=%s", (set_id,)).fetchone())
    versions = connection.execute("SELECT v.*,s.revision AS source_skill_revision FROM set_versions v JOIN skill_versions s ON s.id=v.source_skill_version_id WHERE set_id=%s ORDER BY v.revision DESC", (set_id,)).fetchall()
    return {**item, "versions": versions}


@router.get("/set-versions/{version_id}")
def version_detail(version_id: UUID, request: Request, connection=Depends(db_connection)):
    row = required(connection.execute("SELECT * FROM set_versions WHERE id=%s", (version_id,)).fetchone())
    return {**row, "files": editor_files(unpack_zip(request.app.state.store.get(row["blob"])))}


class DraftSource(BaseModel):
    source_version_id: UUID | None = None


@router.post("/sets/{set_id}/import")
def import_into_set(set_id: UUID, body: NewSet, request: Request, connection=Depends(db_connection)):
    item = required(connection.execute("SELECT * FROM evaluation_sets WHERE id=%s AND NOT archived FOR UPDATE", (set_id,)).fetchone())
    required(connection.execute("SELECT id FROM skill_versions WHERE id=%s AND skill_id=%s", (body.source_skill_version_id, item["skill_id"])).fetchone())
    if body.original_blob:
        request.app.state.store.get(body.original_blob)
    files = from_editor({name: value.model_dump() for name, value in body.files.items()})
    return create_draft(connection, request.app.state.store, set_id, body.source_skill_version_id, files,
                        body.original_blob, validate_suite(files, request.app.state.settings.skill_up))


@router.post("/sets/{set_id}/drafts")
def fork_draft(set_id: UUID, body: DraftSource, request: Request, connection=Depends(db_connection)):
    item = required(connection.execute("SELECT * FROM evaluation_sets WHERE id=%s FOR UPDATE", (set_id,)).fetchone())
    source = required(connection.execute("SELECT * FROM set_versions WHERE id=%s AND set_id=%s", (body.source_version_id or item["active_version_id"], set_id)).fetchone(), "请先选择需要编辑的版本")
    files = unpack_zip(request.app.state.store.get(source["blob"]))
    return create_draft(connection, request.app.state.store, set_id, source["source_skill_version_id"], files,
                        source["original_blob"], source["validation"])


class DraftUpdate(BaseModel):
    expected_edit_number: int = Field(ge=1)
    files: dict[str, EditorFile]


@router.put("/set-versions/{version_id}")
def update_draft(version_id: UUID, body: DraftUpdate, request: Request, connection=Depends(db_connection)):
    row = required(connection.execute("SELECT * FROM set_versions WHERE id=%s FOR UPDATE", (version_id,)).fetchone())
    if row["kind"] != "DRAFT" or row["archived"]:
        raise HTTPException(409, "已保存版本不可修改，请先创建草稿")
    if row["edit_number"] != body.expected_edit_number:
        raise HTTPException(409, "内容已被其他页面修改，请刷新后再编辑")
    files = from_editor({name: value.model_dump() for name, value in body.files.items()})
    blob = request.app.state.store.put(pack_zip(files))
    return connection.execute("UPDATE set_versions SET blob=%s,edit_number=edit_number+1,validation='{}' WHERE id=%s RETURNING *",
                              (blob, version_id)).fetchone()


@router.post("/set-versions/{version_id}/validate")
def validate_version(version_id: UUID, request: Request, connection=Depends(db_connection)):
    row = required(connection.execute("SELECT * FROM set_versions WHERE id=%s FOR UPDATE", (version_id,)).fetchone())
    validation = validate_suite(unpack_zip(request.app.state.store.get(row["blob"])), request.app.state.settings.skill_up)
    connection.execute("UPDATE set_versions SET validation=%s WHERE id=%s", (jsonb(validation), version_id))
    return validation


class RevisionInput(BaseModel):
    expected_edit_number: int = Field(ge=1)


@router.post("/set-versions/{version_id}/save")
def save_version(version_id: UUID, body: RevisionInput, request: Request, connection=Depends(db_connection)):
    # Always lock the set before its versions, matching fork and activation operations.
    hint = required(connection.execute("SELECT set_id FROM set_versions WHERE id=%s", (version_id,)).fetchone())
    connection.execute("SELECT id FROM evaluation_sets WHERE id=%s FOR UPDATE", (hint["set_id"],))
    row = required(connection.execute("SELECT * FROM set_versions WHERE id=%s FOR UPDATE", (version_id,)).fetchone())
    if row["kind"] != "DRAFT" or row["archived"] or row["edit_number"] != body.expected_edit_number:
        raise HTTPException(409, "草稿状态已改变，请刷新后重试")
    validation = validate_suite(unpack_zip(request.app.state.store.get(row["blob"])), request.app.state.settings.skill_up)
    if not validation["valid"]:
        raise HTTPException(422, {"message": "请先修复校验问题", "validation": validation})
    revision = connection.execute("SELECT max(revision)+1 AS n FROM set_versions WHERE set_id=%s", (row["set_id"],)).fetchone()["n"]
    saved = connection.execute(
        """INSERT INTO set_versions(id,set_id,source_skill_version_id,kind,revision,blob,original_blob,validation)
           VALUES(%s,%s,%s,'SAVED',%s,%s,%s,%s) RETURNING *""",
        (new_id(), row["set_id"], row["source_skill_version_id"], revision, row["blob"], row["original_blob"], jsonb(validation))).fetchone()
    connection.execute("UPDATE set_versions SET archived=true WHERE id=%s", (version_id,))
    return saved


class VersionInput(BaseModel):
    version_id: UUID


@router.post("/sets/{set_id}/activate")
def activate(set_id: UUID, body: VersionInput, request: Request, connection=Depends(db_connection)):
    required(connection.execute("SELECT id FROM evaluation_sets WHERE id=%s AND NOT archived FOR UPDATE", (set_id,)).fetchone())
    row = required(connection.execute("SELECT * FROM set_versions WHERE id=%s AND set_id=%s AND NOT archived AND kind='SAVED'", (body.version_id, set_id)).fetchone())
    validation = validate_suite(unpack_zip(request.app.state.store.get(row["blob"])), request.app.state.settings.skill_up)
    if not validation["valid"]:
        raise HTTPException(422, {"message": "该版本不能启用", "validation": validation})
    connection.execute("UPDATE evaluation_sets SET active_version_id=%s WHERE id=%s", (body.version_id, set_id))
    return {"active_version_id": body.version_id, "validation": validation}


class SetInput(BaseModel):
    set_id: UUID


@router.post("/skills/{skill_id}/default-set")
def default_set(skill_id: UUID, body: SetInput, connection=Depends(db_connection)):
    required(connection.execute("SELECT id FROM evaluation_sets WHERE id=%s AND skill_id=%s AND NOT archived", (body.set_id, skill_id)).fetchone())
    connection.execute("UPDATE skills SET default_set_id=%s WHERE id=%s", (body.set_id, skill_id))
    return {"default_set_id": body.set_id}


@router.get("/set-versions/{version_id}/export")
def export_version(version_id: UUID, request: Request, connection=Depends(db_connection)):
    row = required(connection.execute("SELECT blob FROM set_versions WHERE id=%s", (version_id,)).fetchone())
    # Repack only suite material; no runtime, logs, credentials or center settings.
    files = unpack_zip(request.app.state.store.get(row["blob"]))
    return Response(pack_zip({name: file for name, file in files.items() if name.startswith("evals/")}),
                    media_type="application/zip", headers={"Content-Disposition": 'attachment; filename="evaluation-set.zip"'})


@router.delete("/set-versions/{version_id}")
def archive_version(version_id: UUID, connection=Depends(db_connection)):
    row = required(connection.execute("SELECT * FROM set_versions WHERE id=%s FOR UPDATE", (version_id,)).fetchone())
    active = connection.execute("SELECT 1 FROM evaluation_sets WHERE active_version_id=%s", (version_id,)).fetchone()
    if active:
        raise HTTPException(409, "请先切换启用版本")
    referenced = connection.execute("SELECT 1 FROM tasks WHERE input->>'set_version_id'=%s LIMIT 1", (str(version_id),)).fetchone()
    if row["kind"] == "DRAFT" and not referenced:
        connection.execute("DELETE FROM set_versions WHERE id=%s", (version_id,))
        return {"deleted": True}
    connection.execute("UPDATE set_versions SET archived=true WHERE id=%s", (version_id,))
    return {"archived": True}
