from dotenv import load_dotenv
from google import genai
import os
from collections.abc import Sequence
from collections.abc import Iterator

load_dotenv()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "your_gemini_api_key_here")

client = genai.Client(api_key=GEMINI_API_KEY)

def send_message(input_text: str, history: Sequence[tuple[str, str]] = ()) -> str:
    return "".join(send_message_stream(input_text, history))


def send_message_stream(
    input_text: str, history: Sequence[tuple[str, str]] = ()
) -> Iterator[str]:
    history_text = "\n".join(
        f"{sender.title()}: {text}" for sender, text in history
    )
    prompt = input_text
    if history_text:
        prompt = (
            "Use the conversation history below to maintain context and answer "
            "the latest user message.\n\n"
            f"Conversation history:\n{history_text}\n\n"
            f"Latest user message:\n{input_text}"
        )

    interaction_stream = client.interactions.create(
        model="gemini-3.5-flash-lite",
        input=prompt,
        stream=True,
    )
    for event in interaction_stream:
        if getattr(event, "event_type", None) != "step.delta":
            continue
        delta = getattr(event, "delta", None)
        if getattr(delta, "type", None) == "text":
            yield delta.text


def send_message_stream_with_title(
    input_text: str, history: Sequence[tuple[str, str]] = ()
) -> Iterator[tuple[str, str]]:
    """Stream a response while extracting a title header from the same model call."""
    history_text = "\n".join(
        f"{sender.title()}: {text}" for sender, text in history
    )
    prompt = (
        "Create a concise conversation title, then answer the user's message. "
        "Your first output must be exactly in this format, followed by a blank line:\n"
        "__SUPER_AI_TITLE__\n"
        "A short title of no more than 50 characters\n"
        "__SUPER_AI_END_TITLE__\n\n"
        "Do not mention or repeat these markers in the answer. Use Markdown when useful.\n\n"
        f"Latest user message:\n{input_text}"
    )
    if history_text:
        prompt = (
            "Use the conversation history below to maintain context and answer the latest user message.\n\n"
            f"Conversation history:\n{history_text}\n\n{prompt}"
        )

    interaction_stream = client.interactions.create(
        model="gemini-3.5-flash-lite",
        input=prompt,
        stream=True,
    )
    buffered = ""
    title_end = "__SUPER_AI_END_TITLE__"
    title_started = False
    title_emitted = False

    for event in interaction_stream:
        if getattr(event, "event_type", None) != "step.delta":
            continue
        delta = getattr(event, "delta", None)
        if getattr(delta, "type", None) != "text":
            continue

        buffered += delta.text
        if not title_started:
            marker_start = buffered.find("__SUPER_AI_TITLE__")
            if marker_start == -1:
                continue
            buffered = buffered[marker_start + len("__SUPER_AI_TITLE__"):]
            title_started = True

        if not title_emitted and title_end in buffered:
            title, remainder = buffered.split(title_end, 1)
            yield "title", title.strip()
            title_emitted = True
            buffered = remainder.lstrip("\r\n")

        if title_emitted and buffered:
            yield "chunk", buffered
            buffered = ""

    if not title_emitted:
        yield "title", ""
        if buffered:
            yield "chunk", buffered
