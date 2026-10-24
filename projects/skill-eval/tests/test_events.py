import json

from worker.runtime import Lease


def test_final_flush_drains_after_previously_unacknowledged_batch(tmp_path):
    class Reply:
        def __init__(self, sequence):
            self.sequence = sequence

        def json(self):
            return {'accepted_sequence': self.sequence}

    class Center:
        def __init__(self):
            self.events = []

        def request(self, method, path, **kwargs):
            self.events.extend(kwargs['json']['events'])
            return Reply(self.events[-1]['sequence'])

    center = Center()
    report = tmp_path / 'report'
    report.mkdir()
    lines = [json.dumps({'event': f'event-{index}'}) + '\n' for index in range(3)]
    (report / 'events.jsonl').write_text(''.join(lines))
    lease = Lease(center, {'attempt_id': 'synthetic', 'lease_token': 'synthetic', 'lease_seconds': 60}, tmp_path, {}, 0)
    # An earlier send read the first event, but its acknowledgement was lost.
    lease.event_position = len(lines[0].encode())
    lease.sequence = 1
    lease.pending_events = [{'sequence': 1, 'payload': {'event': 'event-0'}}]
    lease.flush_events()
    assert [event['sequence'] for event in center.events] == [1, 2, 3]
    assert lease.pending_events == []
    assert lease.event_position == (report / 'events.jsonl').stat().st_size
