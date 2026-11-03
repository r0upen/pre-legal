---
name: cerebras
description: Use when writing code that calls an LLM. Calls gpt-oss-120b through LiteLLM and OpenRouter, pinned to Cerebras as the inference provider, with structured outputs.
---

# Calling an LLM via OpenRouter + Cerebras

## Setup
- Add dependencies with uv: `uv add litellm python-dotenv pydantic`
- The key is `OPENROUTER_API_KEY` in `.env` at the project root. Load it with python-dotenv. Never print or log it.

## Constants
```python
MODEL = "openrouter/openai/gpt-oss-120b"
EXTRA_BODY = {"provider": {"order": ["cerebras"], "allow_fallbacks": False}}
MAX_TOKENS = 2000
```
EXTRA_BODY pins the request to Cerebras, which is very fast. Always pass it.

MAX_TOKENS caps the reply length. Always pass it as `max_tokens`: without it, OpenRouter
reserves credit for the model's maximum (about 41,000 tokens) on every call, and calls fail
with 402 once the remaining credit is below that. gpt-oss-120b's hidden reasoning counts
toward the cap, so measure real calls (`response.usage.completion_tokens`) before lowering it.

## Plain call
```python
from dotenv import load_dotenv
from litellm import completion

load_dotenv()

def ask(messages: list[dict]) -> str:
    response = completion(model=MODEL, messages=messages, extra_body=EXTRA_BODY, max_tokens=MAX_TOKENS)
    return response.choices[0].message.content
```

## Structured output
Define a Pydantic model and pass it as response_format. Parse the reply back into the model.
```python
from pydantic import BaseModel

class ChatTurn(BaseModel):
    reply: str            # what the assistant says to the user
    fields: dict[str, str] # document fields filled in so far

def ask_structured(messages: list[dict]) -> ChatTurn:
    response = completion(
        model=MODEL,
        messages=messages,
        response_format=ChatTurn,
        extra_body=EXTRA_BODY,
        max_tokens=MAX_TOKENS,
    )
    return ChatTurn.model_validate_json(response.choices[0].message.content)
```

## Rules
- Use one structured call per chat turn; don't stream.
- Pass `max_tokens=MAX_TOKENS` on every call.
- Keep LLM code in one backend module so it's easy to find and test.
- In tests, mock `completion` instead of calling the real API.