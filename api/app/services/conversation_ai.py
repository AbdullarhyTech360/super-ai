import os
from collections.abc import Sequence
from collections.abc import Iterator
from dataclasses import dataclass

from dotenv import load_dotenv
from google import genai

load_dotenv()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "your_gemini_api_key_here")

client = genai.Client(api_key=GEMINI_API_KEY)

# Registry of the model tiers exposed to chat. Display names are user facing
# ("Super AI Lite", ...) while the actual Gemini model + thinking level is
# configured here and overridable through the environment.
@dataclass(frozen=True)
class ModelProfile:
    key: str
    model: str
    thinking_level: str  # "low" | "medium" | "high"
    label: str


MODEL_PROFILES: dict[str, ModelProfile] = {
    "lite": ModelProfile(
        key="lite",
        model=os.environ.get("GEMINI_MODEL_LITE", "gemini-3.5-flash-lite"),
        thinking_level=os.environ.get("GEMINI_LITE_THINKING", "low"),
        label="Super AI Lite",
    ),
    "balanced": ModelProfile(
        key="balanced",
        model=os.environ.get("GEMINI_MODEL_BALANCED", "gemini-3.5-flash"),
        thinking_level=os.environ.get("GEMINI_BALANCED_THINKING", "medium"),
        label="Super AI Balanced",
    ),
    "pro": ModelProfile(
        key="pro",
        model=os.environ.get("GEMINI_MODEL_PRO", "gemini-3.6-flash"),
        thinking_level=os.environ.get("GEMINI_PRO_THINKING", "high"),
        label="Super AI Pro",
    ),
}

# 'auto' only escalates to the heavier tier for prompts that clearly need it.
# A question alone is not a signal: most of them answer well on the fast model,
# and the slower tiers are one tap away in the model picker.
AUTO_LONG_PROMPT_CHARS = int(os.environ.get("AUTO_LONG_PROMPT_CHARS", "600"))

COMPLEX_PROMPT_TOKENS = (
    "write",
    "code",
    "debug",
    "refactor",
    "explain in detail",
    "analyze",
)

SUPER_AI_INSTRUCTION = (
    "You are Super AI. Your name is always \u201cSuper AI\u201d \u2014 never call "
    "yourself a generic LLM, an assistant trained by Google, or any other name. "
    "Only reveal who you are when the user directly asks who you are, where you "
    "come from, or what you are. Otherwise never introduce yourself, never mention "
    "your name or identity, and never open a reply with a greeting or self-pitch "
    "like \u201cHello! I am Super AI.\u201d Always get straight to answering the user's "
    "latest question.\n\n"
    "The meaning of \u201cSuper AI\u201d: \u201csuper\u201d means above and beyond, and \u201cAI\u201d "
    "is intelligent conversation. Super AI exists to elevate every conversation \u2014 "
    "one light, many perspectives, where a single spark of dialogue flowers into "
    "endless understanding. You are the prism at the centre of that light: humble, "
    "curious, and committed to thinking clearly, honestly, and helpfully with every "
    "person who speaks to you.\n\n"
    "Accuracy rules: never fabricate facts, statistics, quotes, names, dates, or "
    "URLs. If a claim comes from the grounding context provided below, base your "
    "answer on it and cite the source where indicated. If you are not sure about "
    "something, say so plainly (\u201cI don't know\u201d or \u201cI'm not certain\u201d) instead "
    "of guessing. When a question asks about current, recent, or factual events, "
    "rely on any provided search results rather than your own knowledge, and "
    "clearly label speculation as speculation.\n"
)


def build_input(
    prompt: str, attachment_parts: Sequence[dict] = ()
) -> str | list[dict]:
    """Build the Gemini interaction input from a prompt and optional file parts."""
    if not attachment_parts:
        return prompt
    return list(attachment_parts) + [{"type": "text", "text": prompt}]


def _prepare_arguments(
    input_text: str,
    history: Sequence[tuple[str, str]],
    attachment_parts: Sequence[dict],
    profile: ModelProfile,
    web_results: Sequence[dict] | None,
    rag_context: str,
) -> dict:
    """Compose the shared prompt/context and generation options."""
    grounding_blocks: list[str] = []
    if web_results:
        from app.services.search_grounding import format_results

        blocks = format_results(web_results)
        if blocks:
            grounding_blocks.append(blocks)
    if rag_context:
        grounding_blocks.append(rag_context)

    context_text = ""
    if grounding_blocks:
        context_text = (
            "\n\nGrounding context:\n" + "\n\n".join(grounding_blocks) + "\n"
        )

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
    prompt = prompt + context_text

    from google.genai.interactions import GenerationConfig

    generation_config = GenerationConfig(thinking_level=profile.thinking_level)

    return {
        "model": profile.model,
        "input": build_input(prompt, attachment_parts),
        "generation_config": generation_config,
        "system_instruction": SUPER_AI_INSTRUCTION,
    }


def resolve_model(
    preference: str,
    input_text: str = "",
    has_attachments: bool = False,
) -> ModelProfile:
    """Resolve a tier preference ('auto', 'lite', 'balanced', 'pro').

    'auto' answers fast by default: only attachment-bound, long, or clearly
    heavy prompts pay for the slower tier. Everything else — including ordinary
    factual questions that trigger web grounding — runs on the lite model,
    which reaches the first token in roughly a second.
    """
    preference = (preference or "auto").strip().lower()
    if preference == "auto":
        text = (input_text or "").lower()
        length = len(input_text or "")
        looks_complex = (
            has_attachments
            or length >= AUTO_LONG_PROMPT_CHARS
            or any(token in text for token in COMPLEX_PROMPT_TOKENS)
        )
        if looks_complex:
            return MODEL_PROFILES["balanced"]
        return MODEL_PROFILES["lite"]
    return MODEL_PROFILES.get(preference, MODEL_PROFILES["lite"])


def send_message(
    input_text: str,
    history: Sequence[tuple[str, str]] = (),
    attachment_parts: Sequence[dict] = (),
    model_preference: str = "auto",
    web_results: Sequence[dict] | None = None,
    rag_context: str = "",
) -> str:
    return "".join(
        send_message_stream(
            input_text,
            history,
            attachment_parts,
            model_preference=model_preference,
            web_results=web_results,
            rag_context=rag_context,
        )
    )


def send_message_stream(
    input_text: str,
    history: Sequence[tuple[str, str]] = (),
    attachment_parts: Sequence[dict] = (),
    model_preference: str = "auto",
    web_results: Sequence[dict] | None = None,
    rag_context: str = "",
) -> Iterator[str]:
    profile = resolve_model(model_preference, input_text, bool(attachment_parts))
    kwargs = _prepare_arguments(
        input_text, history, attachment_parts, profile, web_results, rag_context
    )

    interaction_stream = client.interactions.create(
        **kwargs,
        stream=True,
    )
    for event in interaction_stream:
        if getattr(event, "event_type", None) != "step.delta":
            continue
        delta = getattr(event, "delta", None)
        if getattr(delta, "type", None) == "text":
            yield delta.text


def send_message_stream_with_title(
    input_text: str,
    history: Sequence[tuple[str, str]] = (),
    attachment_parts: Sequence[dict] = (),
    model_preference: str = "auto",
    web_results: Sequence[dict] | None = None,
    rag_context: str = "",
) -> Iterator[tuple[str, str]]:
    """Stream a response while extracting a title header from the same model call."""
    profile = resolve_model(model_preference, input_text, bool(attachment_parts))

    grounding_blocks: list[str] = []
    if web_results:
        from app.services.search_grounding import format_results

        blocks = format_results(web_results)
        if blocks:
            grounding_blocks.append(blocks)
    if rag_context:
        grounding_blocks.append(rag_context)
    context_text = ""
    if grounding_blocks:
        context_text = (
            "\n\nGrounding context:\n" + "\n\n".join(grounding_blocks) + "\n"
        )

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
    prompt = prompt + context_text

    from google.genai.interactions import GenerationConfig

    generation_config = GenerationConfig(thinking_level=profile.thinking_level)

    interaction_stream = client.interactions.create(
        model=profile.model,
        input=build_input(prompt, attachment_parts),
        generation_config=generation_config,
        system_instruction=SUPER_AI_INSTRUCTION,
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