import pytest

from worker.results import summarize


def row(case_id="a", status="PASS"):
    return {"case_id": case_id, "status": status, "grading": {"status": status,
            "assertion_results": [{"text": "expected text", "passed": status == "PASS"}]}}


def test_completed_assertion_failure_is_not_system_failure():
    result = summarize({"case_results": [row(status="FAIL")]}, ["a"], 1)
    assert (result["execution_state"], result["verdict"]) == ("SUCCEEDED", "FAILED")


@pytest.mark.parametrize("rows", [[], [row("other")], [row(), row()],
                                  [{"case_id": "a", "status": "SKIP"}],
                                  [{"case_id": "a", "status": "ERROR"}],
                                  [{"case_id": "a", "status": "PASS", "grading": {"status": "PASS"}}]])
def test_incomplete_or_invalid_report_never_passes(rows):
    result = summarize({"case_results": rows}, ["a"], 0)
    assert result["verdict"] == "INCOMPLETE"


def test_requested_model_is_not_actual_model():
    result = summarize({"case_results": [row()], "requested_configuration": {"model": "requested"}}, ["a"], 0)
    assert result["verdict"] == "PASSED"
    assert result["actual_model"] is None
