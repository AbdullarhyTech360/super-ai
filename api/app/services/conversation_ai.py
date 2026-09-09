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
