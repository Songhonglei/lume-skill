import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from .db import transaction
from .repairs import accept_candidate, create_repair, progress, publish, repair_manifest, save_review


class RepairCreate(BaseModel):
    audit_run_id: str
    selected_ids: list[str] = Field(min_length=1, max_length=200)
    target_version: str = Field(min_length=1, max_length=80)
    allowed_paths: list[str] = Field(default_factory=list, max_length=500)
    max_rounds: int = Field(default=3, ge=1, le=3)
    publish_after_review: bool = True
    make_current: bool = False
    idempotency_key: str = Field(min_length=1, max_length=128)


class ReviewBody(BaseModel):
    generation: int = Field(ge=1)
    round_number: int = Field(ge=1, le=3)
    result: dict


def repair_tools(edit_paths):
    def tool(name, description, props):
        return {
            "type": "function",
            "function": {
                "name": name,
                "description": description,
                "parameters": {
                    "type": "object",
                    "properties": props,
                    "required": list(props),
                    "additionalProperties": False,
                },
            },
        }

    path = {"type": "string", "enum": edit_paths}
    return [
        tool(
            "finish_edit",
            "Finish editing the candidate, or stop for human attention. Never claims the independent review passed.",
            {"needsAttention": {"type": "boolean"}, "reason": {"type": "string"}},
        ),
        tool(
            "read_file",
            "Read a UTF-8 file in the fixed candidate only; no code execution.",
            {"path": {"type": "string"}, "offset": {"type": "integer"}, "limit": {"type": "integer"}},
        ),
        tool(
            "write_candidate",
            "Write only an authorized UTF-8 candidate file. Original stays immutable. expected_digest is SHA256 of current bytes, or empty for a new file.",
            {"path": path, "expected_digest": {"type": "string"}, "content": {"type": "string"}},
        ),
        tool(
            "delete_candidate",
            "Remove an authorized candidate file by exact SHA256. SKILL.md cannot be removed.",
            {"path": path, "expected_digest": {"type": "string"}},
        ),
    ]


REPAIR_SCHEMA = {
    "type": "object",
    "properties": {"needsAttention": {"type": "boolean"}, "reason": {"type": "string"}},
    "required": ["needsAttention", "reason"],
    "additionalProperties": False,
}


def install_repair_api(app, root, authenticated, machine):
    router = APIRouter(prefix="/api")

    @router.post("/repairs")
    def create(body: RepairCreate, user=Depends(authenticated)):
        return create_repair(root, user, **body.model_dump())

    @router.get("/repairs/{repair_id}")
    def detail(repair_id: str, user=Depends(authenticated)):
        with transaction(root) as db:
            row = db.execute("SELECT * FROM repair_runs WHERE id=?", (repair_id,)).fetchone()
            if not row:
                raise HTTPException(404, "修复记录不存在")
            result = dict(row)
            result["authorization"] = json.loads(result.pop("authorization_json"))
            result["rounds"] = []
            for item in db.execute(
                "SELECT r.*,a.digest AS artifact_digest FROM repair_rounds r JOIN artifacts a ON a.id=r.artifact_id WHERE repair_run_id=? ORDER BY round_number",
                (repair_id,),
            ):
                record = dict(item)
                record["diff"] = json.loads(record.pop("diff_json"))
                raw = record.pop("review_json")
                record["review"] = json.loads(raw) if raw else None
                result["rounds"].append(record)
            return result

    @router.get("/repairs/{repair_id}/candidate")
    def candidate(repair_id: str, user=Depends(authenticated)):
        result = detail(repair_id, user)
        if not result["rounds"]:
            raise HTTPException(409, "候选尚未保存")
        digest = result["rounds"][-1]["artifact_digest"]
        return FileResponse(
            root / "objects" / (digest + ".zip"),
            media_type="application/zip",
            filename="candidate-" + repair_id + ".zip",
            headers={"X-Artifact-SHA256": digest},
        )

    @router.get("/repairs/{repair_id}/report")
    def report(repair_id: str, user=Depends(authenticated)):
        result = detail(repair_id, user)
        review = result["rounds"][-1]["review"] if result["rounds"] else None
        if not review:
            raise HTTPException(409, "复审报告尚未保存")
        return Response(
            review["reportMarkdown"],
            media_type="text/markdown; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="repair-review-{repair_id}.md"'},
        )

    @router.post("/repairs/{repair_id}/publish")
    def register(repair_id: str, user=Depends(authenticated)):
        return publish(root, user, repair_id)

    @router.get("/worker/attempts/{attempt_id}/repair-state")
    def state(attempt_id: str, generation: int, worker=Depends(machine)):
        return progress(root, worker["id"], attempt_id, generation)

    @router.get("/worker/attempts/{attempt_id}/candidate")
    def get_candidate(attempt_id: str, generation: int, round_number: int, worker=Depends(machine)):
        with transaction(root) as db:
            _, manifest, _ = repair_manifest(db, worker["id"], attempt_id, generation)
            row = db.execute(
                "SELECT a.digest FROM repair_rounds r JOIN artifacts a ON a.id=r.artifact_id WHERE repair_run_id=? AND round_number=?",
                (manifest["repairRunId"], round_number),
            ).fetchone()
            if not row:
                raise HTTPException(404, "候选不存在")
        return FileResponse(root / "objects" / (row[0] + ".zip"), media_type="application/zip")

    @router.post("/worker/attempts/{attempt_id}/candidate")
    async def upload_candidate(
        attempt_id: str, generation: int, round_number: int, request: Request, worker=Depends(machine)
    ):
        raw = await request.body()
        if len(raw) > 16777216:
            raise HTTPException(413, "候选包最多 16 MiB")
        return await run_in_threadpool(
            accept_candidate, root, worker["id"], attempt_id, generation, round_number, raw
        )

    @router.post("/worker/attempts/{attempt_id}/review")
    def review(attempt_id: str, body: ReviewBody, worker=Depends(machine)):
        return save_review(root, worker["id"], attempt_id, body.generation, body.round_number, body.result)

    app.include_router(router)
