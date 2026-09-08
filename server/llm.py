"""Foundation Model client for AI insight generation.

v1 "agent": a single LLM call over pre-computed aggregates. Kept modular
(build_prompt + call_llm) so it can later be swapped for an Agent Framework
agent without changing the route handlers.
"""
import requests

from .config import SERVING_ENDPOINT, get_token, get_workspace_host

_SYSTEM = (
    "You are a claims operations analyst for a healthcare payer. "
    "You write concise, executive-ready insights grounded ONLY in the data "
    "provided. Use markdown. Be specific with numbers and dollar figures. "
    "Do not invent data. End with a short '## Recommended Actions' list of "
    "2-4 concrete, prioritized actions."
)


def call_llm(user_prompt: str, user_token: str | None = None, max_tokens: int = 900) -> str:
    host = get_workspace_host()
    token = get_token(user_token)
    url = f"{host}/serving-endpoints/{SERVING_ENDPOINT}/invocations"
    payload = {
        "messages": [
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": max_tokens,
        "temperature": 0.3,
    }
    resp = requests.post(
        url,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=payload,
        timeout=90,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"LLM error ({resp.status_code}): {resp.text[:500]}")
    data = resp.json()
    return data["choices"][0]["message"]["content"]
