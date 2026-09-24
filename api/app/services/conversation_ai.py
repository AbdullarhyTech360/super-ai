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
    # The interactions API has no way to switch thinking off (its floor is
    # "low"), but the classic API honours thinkingBudget=0 — measured at ~0.8-1.3s
    # to the first token versus ~1.9-2.7s for interactions at "low", and it is
    # the one API where gemini-2.5-flash-lite actually emits text. A classic
    # profile runs the classic streaming call with thinking off and ignores its
    # thinking_level.
    use_classic: bool = False


# Reasoning budget per tier. Thinking tokens are generated before the first
# visible token, so every tier is kept at the lowest level that still answers
# well: 'lite' spends nothing on it, only 'pro' pays the high budget.
# Whether that reasoning is *described* back to the user is a separate switch
# (see stream_message_events).
MODEL_PROFILES: dict[str, ModelProfile] = {
    "lite": ModelProfile(
        key="lite",
        model=os.environ.get("GEMINI_MODEL_LITE", "gemini-2.5-flash-lite"),
        thinking_level=os.environ.get("GEMINI_LITE_THINKING", "low"),
        label="Super AI Lite",
        use_classic=True,
    ),
    "balanced": ModelProfile(
        key="balanced",
        model=os.environ.get("GEMINI_MODEL_BALANCED", "gemini-2.5-flash"),
        thinking_level=os.environ.get("GEMINI_BALANCED_THINKING", "low"),
        label="Super AI Balanced",
    ),
    "pro": ModelProfile(
        key="pro",
        model=os.environ.get("GEMINI_MODEL_PRO", "gemini-2.5-flash"),
        thinking_level=os.environ.get("GEMINI_PRO_THINKING", "high"),
        label="Super AI Pro",
    ),
}

# 'auto' only escalates to the heavier tier for prompts that clearly need it.
# A question alone is not a signal: most of them answer well on the fast model,
# and the slower tiers are one tap away in the model picker.
AUTO_LONG_PROMPT_CHARS = int(os.environ.get("AUTO_LONG_PROMPT_CHARS", "600"))

# Keywords are a weak signal on their own: "explain this code" is a three-word
# request that the lite model handles in under a second, so they only escalate
# once the prompt is long enough to actually carry work.
AUTO_COMPLEX_MIN_CHARS = int(os.environ.get("AUTO_COMPLEX_MIN_CHARS", "200"))

COMPLEX_PROMPT_TOKENS = (
    "write",
    "code",
    "debug",
    "refactor",
    "explain in detail",
    "analyze",
)

# Title generation is a labelling task, not a reasoning task: it runs on the
# fastest tier with the smallest reasoning budget, and it is issued alongside
# the answer so its latency is never on the user's path. The output cap has to
# cover the model's hidden reasoning tokens *and* the title itself — a budget
# sized only for the title (e.g. 24) gets consumed by thinking and truncates the
# reply to an empty string, so it is kept generous. TITLE_MAX_CHARS still trims
# the final label.
# Classic (lite-tier) thinking budget. Zero is the speed choice: it measured
# ~1.3-1.7s to the first token but leaves the model unable to plan, so its
# answers come out short and shallow. Raising it (e.g. 512) trades roughly a
# second of ttfb per 256 tokens for noticeably better explanations.
LITE_THINKING_BUDGET = int(os.environ.get("GEMINI_LITE_THINKING_BUDGET", "0"))

TITLE_MODEL = os.environ.get("GEMINI_MODEL_TITLE", "gemini-2.5-flash")
TITLE_THINKING_LEVEL = os.environ.get("GEMINI_TITLE_THINKING", "low")
TITLE_MAX_OUTPUT_TOKENS = int(os.environ.get("TITLE_MAX_OUTPUT_TOKENS", "128"))
TITLE_MAX_CHARS = int(os.environ.get("TITLE_MAX_CHARS", "50"))

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
    "clearly label speculation as speculation.\n\n"
    "Do not be sycophantic. If the user states or implies something you believe is "
    "factually wrong, do not simply agree to be agreeable \u2014 say plainly that you "
    "are not sure that is right and explain your reasoning. A user correcting you "
    "is not by itself proof that they are right; re-check the facts rather than "
    "cave. Equally, if you genuinely do not know, admit it instead of inventing an "
    "answer to fill the gap.\n\n"
    "Translations and questions about a specific language (\u201cwhat is the word for X "
    "in Y\u201d, word meanings, etymologies) are easy to get wrong and are usually not "
    "covered by search snippets. Never invent a word, spelling, or derivation to "
    "sound authoritative. Give the term only when you are confident; otherwise "
    "give your best guess with an explicit hedge (\u201cI believe \u2026 but I could be "
    "wrong\u201d) or say you are not certain.\n\n"
    "Answer length follows the question, not the other way round: keep simple "
    "questions to a direct, brief answer, but when the user asks you to "
    "explain, teach, compare, analyse, or walk through something, give a "
    "complete, properly detailed answer \u2014 structured sections, examples, "
    "and edge cases where they help \u2014 even if that takes many paragraphs. "
    "Never compress an answer that needs room just to be concise; \u201cstraight "
    "to the point\u201d means no preamble, not a short reply.\n"
)


def build_input(
    prompt: str, attachment_parts: Sequence[dict] = ()
) -> str | list[dict]:
    """Build the Gemini interaction input from a prompt and optional file parts."""
    if not attachment_parts:
        return prompt
    return list(attachment_parts) + [{"type": "text", "text": prompt}]


def _compose_prompt(
    input_text: str,
    history: Sequence[tuple[str, str]],
    web_results: Sequence[dict] | None,
    rag_context: str,
) -> str:
    """Fold history and grounding context into the single text the model reads."""
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
    return prompt + context_text


def _prepare_arguments(
    input_text: str,
    history: Sequence[tuple[str, str]],
    attachment_parts: Sequence[dict],
    profile: ModelProfile,
    web_results: Sequence[dict] | None,
    rag_context: str,
    show_thinking: bool = False,
) -> dict:
    """Compose the shared prompt/context and generation options."""
    prompt = _compose_prompt(input_text, history, web_results, rag_context)

    from google.genai.interactions import GenerationConfig

    # 'auto' asks the model to publish a summary of its reasoning alongside the
    # answer; 'none' keeps the reasoning internal, which is the cheaper default.
    generation_config = GenerationConfig(
        thinking_level=profile.thinking_level,
        thinking_summaries="auto" if show_thinking else "none",
    )

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
            or (
                length >= AUTO_COMPLEX_MIN_CHARS
                and any(token in text for token in COMPLEX_PROMPT_TOKENS)
            )
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


def stream_message_events(
    input_text: str,
    history: Sequence[tuple[str, str]] = (),
    attachment_parts: Sequence[dict] = (),
    model_preference: str = "auto",
    web_results: Sequence[dict] | None = None,
    rag_context: str = "",
    show_thinking: bool = False,
) -> Iterator[tuple[str, str]]:
    """Stream a turn as ('stage' | 'thinking' | 'chunk', text) events.

    Reasoning is otherwise invisible: the model thinks for seconds before its
    first visible token, and the summary deltas that do describe that thinking
    arrive on the same stream the answer text uses. Forwarding them lets the
    client show the wait being spent rather than endured.
    """
    profile = resolve_model(model_preference, input_text, bool(attachment_parts))
    if profile.use_classic:
        yield from _stream_classic(
            profile,
            input_text,
            history,
            attachment_parts,
            web_results,
            rag_context,
        )
        return

    kwargs = _prepare_arguments(
        input_text,
        history,
        attachment_parts,
        profile,
        web_results,
        rag_context,
        show_thinking,
    )

    answering_announced = False
    interaction_stream = client.interactions.create(**kwargs, stream=True)
    for event in interaction_stream:
        event_type = getattr(event, "event_type", None)

        # The interactions API reports some failures (quota, invalid config)
        # as an in-band stream event instead of raising. Dropping it would end
        # the turn with an empty answer and no explanation, so it becomes an
        # exception the chat route already turns into an error event.
        if event_type == "error":
            error = getattr(event, "error", None)
            message = getattr(error, "message", None) or "The model returned an error."
            raise RuntimeError(message)

        # A thought step is how the model signals it has started reasoning. It
        # arrives even when no summary text is published for that reasoning, but
        # the "Thinking" step is only announced when the user asked for it.
        if event_type == "step.start":
            if (
                show_thinking
                and getattr(getattr(event, "step", None), "type", None) == "thought"
            ):
                yield "stage", "thinking"
            continue

        if event_type != "step.delta":
            continue

        delta = getattr(event, "delta", None)
        delta_type = getattr(delta, "type", None)

        if delta_type == "thought_summary":
            summary = _thought_summary_text(getattr(delta, "content", None))
            # The switch is a promise as well as a request: with it off, nothing
            # about the model's reasoning reaches the client, even if the tier
            # published some anyway.
            if summary and show_thinking:
                yield "thinking", summary
        elif delta_type == "text":
            if not answering_announced:
                answering_announced = True
                yield "stage", "answering"
            yield "chunk", delta.text


def _thought_summary_text(content: object) -> str:
    """Pull the text out of a thought-summary delta, whatever shape it arrives in."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    text = getattr(content, "text", None)
    return text if isinstance(text, str) else ""


def _classic_contents(prompt: str, attachment_parts: Sequence[dict]) -> str | list:
    """Translate interactions-format parts for the classic API.

    The two APIs accept different part shapes, and uploads only reach this
    path when the user forces the lite tier on an attached message (auto
    sends attachments to balanced), so the translation is small and explicit.
    """
    if not attachment_parts:
        return prompt
    import base64

    from google.genai import types

    parts = []
    for part in attachment_parts:
        if part.get("type") == "text":
            parts.append(types.Part.from_text(text=part.get("text", "")))
        else:
            parts.append(
                types.Part.from_bytes(
                    data=base64.b64decode(part["data"]),
                    mime_type=part["mime_type"],
                )
            )
    parts.append(types.Part.from_text(text=prompt))
    return parts


def _stream_classic(
    profile: ModelProfile,
    input_text: str,
    history: Sequence[tuple[str, str]],
    attachment_parts: Sequence[dict],
    web_results: Sequence[dict] | None,
    rag_context: str,
) -> Iterator[tuple[str, str]]:
    """Stream a turn through the classic API with thinking switched off.

    There is nothing to report before the answer here: with a zero budget the
    model publishes no reasoning, so the stream opens with 'answering' the
    moment the first text chunk lands, whatever the thinking switch says.
    """
    from google.genai.types import GenerateContentConfig, ThinkingConfig

    prompt = _compose_prompt(input_text, history, web_results, rag_context)
    stream = client.models.generate_content_stream(
        model=profile.model,
        contents=_classic_contents(prompt, attachment_parts),
        config=GenerateContentConfig(
            system_instruction=SUPER_AI_INSTRUCTION,
            thinking_config=ThinkingConfig(thinking_budget=LITE_THINKING_BUDGET),
        ),
    )
    answering_announced = False
    for chunk in stream:
        text = chunk.text
        if not text:
            continue
        if not answering_announced:
            answering_announced = True
            yield "stage", "answering"
        yield "chunk", text


def send_message_stream(
    input_text: str,
    history: Sequence[tuple[str, str]] = (),
    attachment_parts: Sequence[dict] = (),
    model_preference: str = "auto",
    web_results: Sequence[dict] | None = None,
    rag_context: str = "",
    show_thinking: bool = False,
) -> Iterator[str]:
    """Stream only the answer text; stage and thinking events are dropped."""
    for kind, value in stream_message_events(
        input_text,
        history,
        attachment_parts,
        model_preference=model_preference,
        web_results=web_results,
        rag_context=rag_context,
        show_thinking=show_thinking,
    ):
        if kind == "chunk":
            yield value


def generate_title(
    input_text: str,
    history: Sequence[tuple[str, str]] = (),
) -> str:
    """Label a conversation in one short line, independently of its answer.

    This is its own call rather than a header folded into the reply: the
    marker-based approach could not emit any answer text until the model had
    finished thinking and written the title, which delayed the first visible
    token on every new conversation. Returns '' when labelling fails so the
    caller can fall back to the prompt itself.
    """
    from google.genai.interactions import GenerationConfig

    turns = "\n".join(
        f"{sender.title()}: {text[:300]}" for sender, text in list(history)[-2:]
    )
    conversation_text = f"{turns}\nUser: {input_text}" if turns else input_text

    try:
        interaction_stream = client.interactions.create(
            model=TITLE_MODEL,
            input=(
                "Write a title for the conversation below in no more than "
                f"{TITLE_MAX_CHARS} characters. Reply with the title only: no "
                "quotes, no trailing punctuation, no preamble.\n\n"
                f"Conversation:\n{conversation_text}"
            ),
            generation_config=GenerationConfig(
                thinking_level=TITLE_THINKING_LEVEL,
                max_output_tokens=TITLE_MAX_OUTPUT_TOKENS,
            ),
            stream=True,
        )
        title = "".join(
            event.delta.text
            for event in interaction_stream
            if getattr(event, "event_type", None) == "step.delta"
            and getattr(event.delta, "type", None) == "text"
        )
    except Exception as exc:
        print(f"[chat] title generation failed: {exc}")
        return ""

    title = " ".join(title.split()).strip('"\'').strip()
    return title[:TITLE_MAX_CHARS]