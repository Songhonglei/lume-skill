"""A successful HTTP response must expose its writes to the next request."""
from fastapi.testclient import TestClient


def test_setup_is_committed_before_success_response(client):
    app = client.app
    visible_at_response = []

    async def observe(scope, receive, send):
        async def check(message):
            if message['type'] == 'http.response.start' and message['status'] == 200:
                with app.state.database.connection() as connection:
                    visible_at_response.append(connection.execute('SELECT singleton FROM administrator').fetchone() is not None)
            await send(message)
        await app(scope, receive, check)

    response = TestClient(observe).post('/api/setup', json={'password': 'synthetic-password-123'},
                                        headers={'Origin': 'http://127.0.0.1:8765'})
    assert response.status_code == 200
    assert visible_at_response == [True]
