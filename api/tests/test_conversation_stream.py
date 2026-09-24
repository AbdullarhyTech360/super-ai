"""Streaming branches of the model call: the classic fast path for the lite
tier, and in-band error events from the interactions API becoming real
exceptions instead of silent empty answers."""

import types

import pytest

import app.services.conversation_ai as ai


def _ns(**kw):
    return types.SimpleNamespace(**kw)


class FakeInteractions:
    def __init__(self, events):
        self._events = events

    def create(self, stream=False, **kwargs):
        return iter(self._events)


class FakeModels:
    def __init__(self, chunks):
        self._chunks = chunks
        self.kwargs = None

    def generate_content_stream(self, **kwargs):
        self.kwargs = kwargs
        return iter(self._chunks)


class FakeClient:
    def __init__(self, interactions_events=(), classic_chunks=()):
        self.interactions = FakeInteractions(list(interactions_events))
        self.models = FakeModels(list(classic_chunks))


def test_error_event_becomes_an_exception(monkeypatch):
    # The interactions API sometimes reports quota failures as a stream event
    # rather than raising; swallowing it would answer with silence.
    events = [
        _ns(event_type="interaction.created"),
        _ns(event_type="error", error=_ns(message="quota exhausted")),
    ]
    monkeypatch.setattr(ai, "client", FakeClient(interactions_events=events))

    with pytest.raises(RuntimeError, match="quota exhausted"):
        list(ai.stream_message_events("hi", model_preference="pro"))


def test_classic_profile_streams_with_thinking_off(monkeypatch):
    chunks = [_ns(text="He"), _ns(text=None), _ns(text="llo")]
    client = FakeClient(classic_chunks=chunks)
    monkeypatch.setattr(ai, "client", client)

    events = list(ai.stream_message_events("hi", model_preference="lite"))

    assert events == [("stage", "answering"), ("chunk", "He"), ("chunk", "llo")]
    assert client.models.kwargs["model"] == ai.MODEL_PROFILES["lite"].model
    config = client.models.kwargs["config"]
    assert config.thinking_config.thinking_budget == 0


def test_interactions_profile_still_uses_the_interactions_api(monkeypatch):
    events = [
        _ns(event_type="step.start", step=_ns(type="message")),
        _ns(
            event_type="step.delta",
            delta=_ns(type="text", text="yo"),
        ),
    ]
    client = FakeClient(interactions_events=events)
    monkeypatch.setattr(ai, "client", client)

    out = list(ai.stream_message_events("hi", model_preference="balanced"))

    assert out == [("stage", "answering"), ("chunk", "yo")]
