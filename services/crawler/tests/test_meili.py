from app.indexer import meili


class FakeIndex:
    def __init__(self):
        self.documents = []
        self.deleted_filter = None

    def add_documents(self, documents):
        self.documents.extend(documents)
        return {"taskUid": 7}

    def delete_documents(self, *, filter):
        self.deleted_filter = filter
        return {"taskUid": 9}


class FakeClient:
    def __init__(self):
        self.fake_index = FakeIndex()
        self.waited = []

    def index(self, _name):
        return self.fake_index

    def wait_for_task(self, task_uid, **_kwargs):
        self.waited.append(task_uid)
        return {"status": "succeeded"}


def test_batch_index_waits_for_task_completion(monkeypatch):
    client = FakeClient()
    monkeypatch.setattr(meili, "get_client", lambda: client)
    count = meili.batch_index([{"id": "one"}])
    assert count == 1
    assert client.waited == [7]


def test_wait_for_task_raises_on_failure():
    class FailedClient(FakeClient):
        def wait_for_task(self, task_uid, **_kwargs):
            return {"status": "failed", "error": {"message": "bad document"}}

    try:
        meili._wait_for_task(FailedClient(), {"taskUid": 8})
    except RuntimeError as error:
        assert "bad document" in str(error)
    else:
        raise AssertionError("Expected failed Meilisearch task to raise")


def test_delete_documents_by_filter_waits_for_completion(monkeypatch):
    client = FakeClient()
    monkeypatch.setattr(meili, "get_client", lambda: client)

    meili.delete_documents_by_filter('domain = "docs.synthetic.local"')

    assert client.fake_index.deleted_filter == 'domain = "docs.synthetic.local"'
    assert client.waited == [9]
