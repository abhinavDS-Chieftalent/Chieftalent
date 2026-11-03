"""OpenAI-compatible client for the NVIDIA NIM endpoint.

Used for every LLM task in the system (ATS CV review, interview evaluation).
No other AI provider is used. Endpoint, key and model come from configuration.
"""

import json
import re
import time

import requests


class NIMError(Exception):
    pass


_PROVIDER_WORDS = re.compile(r"(?<![A-Za-z])(nim-proxy|nim|nvidia)(?![a-z])", re.IGNORECASE)


def public_error(text):
    """Error text that may reach a screen: the provider is never named, only "AI API"."""
    return _PROVIDER_WORDS.sub("AI API", str(text or ""))


class NIMClient:
    def __init__(self, base_url, api_key="", model=""):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model or None

    def _headers(self):
        h = {"Content-Type": "application/json"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    def health(self):
        """Check server availability and list models. Never raises."""
        try:
            r = requests.get(f"{self.base_url}/models", headers=self._headers(), timeout=10)
            r.raise_for_status()
            models = [m.get("id", "") for m in r.json().get("data", [])]
            return {"ok": True, "models": models, "error": ""}
        except Exception as e:  # noqa: BLE001 - health check must not raise
            return {"ok": False, "models": [], "error": str(e)}

    def resolve_model(self):
        """Return configured model, or auto-discover a suitable chat model."""
        if self.model:
            return self.model
        models = self.health().get("models") or []
        preferred = [
            "openai/gpt-oss-20b",                      # efficient MoE, reliable JSON
            "z-ai/glm-5.3-flash",                      # fast, verified JSON
            "moonshotai/kimi-k3",                      # heavier but proven
            "nvidia/llama-3.1-nemotron-70b-instruct",
            "mistralai/mistral-large",
        ]
        for p in preferred:
            if p in models:
                self.model = p
                return p
        skip = (
            "embed", "vision", "guard", "parse", "vlm", "nvclip", "deplot",
            "fuyu", "kosmos", "vila", "diffusion", "synthetic", "translate",
            "reward", "safety",
        )
        for m in models:
            if m and not any(s in m.lower() for s in skip):
                self.model = m
                return m
        if models:
            self.model = models[0]
            return self.model
        raise NIMError("AI API has no models available and no model is configured")

    def chat(self, messages, temperature=0.6, max_tokens=6000, retries=3):
        """Chat completion with retry on empty content / transient errors.

        Reasoning models (e.g. nemotron lightning) can spend the whole token
        budget THINKING before writing any content: the response comes back
        with finish_reason "length" and empty content. That is not a
        transient failure - retrying with the same budget fails the same
        way - so each retry DOUBLES the budget (capped) instead.
        """
        model = self.resolve_model()
        budget = max_tokens
        last_error = "unknown"
        for attempt in range(retries):
            payload = {
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": budget,
                "stream": False,
                # Reasoning models (nemotron lightning) burn the whole
                # budget THINKING before writing content - minutes on a
                # loaded proxy. Disabling thinking makes them answer in
                # seconds; non-reasoning models ignore this kwarg.
                "chat_template_kwargs": {"thinking": False},
                # Server-side JSON guarantee: the proxy enforces valid JSON
                # at decode time, so a sloppy model cannot emit broken JSON.
                "response_format": {"type": "json_object"},
            }
            try:
                r = requests.post(
                    f"{self.base_url}/chat/completions",
                    headers=self._headers(),
                    json=payload,
                    timeout=180,
                )
                r.raise_for_status()
                data = r.json()
                choices = data.get("choices") or []
                content = ""
                finish = ""
                if choices:
                    msg = choices[0].get("message") or {}
                    content = msg.get("content") or ""
                    finish = choices[0].get("finish_reason") or ""
                if content.strip():
                    return content
                if finish == "length":
                    last_error = (
                        f"token budget {budget} exhausted before any content "
                        f"(reasoning model) - doubling budget"
                    )
                    budget = min(budget * 2, 48000)
                    continue
                last_error = "model returned empty content"
            except Exception as e:  # noqa: BLE001 - retried below
                last_error = str(e)
            time.sleep(2 * (attempt + 1))
        raise NIMError(f"AI API request failed after {retries} attempts: {public_error(last_error)}")

    def chat_json(self, messages, **kwargs):
        """Chat completion whose response is parsed as a JSON object."""
        text = self.chat(messages, **kwargs)
        return extract_json(text)


def extract_json(text):
    """Tolerantly extract the first JSON object from model output.

    Small local models regularly emit near-JSON: unescaped quotes inside
    string values ("What is "list" in Python?"), trailing commas, or output
    truncated mid-object. Salvage ladder (cheapest repair first):

      1. direct parse
      2. escape quotes that appear *inside* string values
      3. + strip trailing commas
      4. + close unbalanced strings/brackets (truncated output)
    """
    t = (text or "").strip()
    if t.startswith("```"):
        t = t.strip("`").strip()
        if t.lower().startswith("json"):
            t = t[4:].strip()
    start = t.find("{")
    end = t.rfind("}")
    if start == -1:
        raise NIMError(f"No JSON object found in model output: {t[:200]!r}")
    candidate = t[start:] if end <= start else t[start:end + 1]

    attempts = (
        candidate,
        _escape_inner_quotes(candidate),
        _strip_trailing_commas(_escape_inner_quotes(candidate)),
        _balance_brackets(_strip_trailing_commas(_escape_inner_quotes(candidate))),
    )
    last_err = None
    for attempt in attempts:
        try:
            return json.loads(attempt)
        except json.JSONDecodeError as e:
            last_err = e
    raise NIMError(f"Invalid JSON in model output: {last_err}") from last_err


def _escape_inner_quotes(t):
    """Escape double quotes that are inside string values.

    A closing quote is genuine only if the next non-space char is structural
    (, } ] : or end of text); otherwise it is content and gets escaped.
    """
    out = []
    i = 0
    n = len(t)
    in_str = False
    while i < n:
        c = t[i]
        if in_str:
            if c == "\\" and i + 1 < n:
                out.append(t[i:i + 2])
                i += 2
                continue
            if c == '"':
                j = i + 1
                while j < n and t[j] in " \t\r\n":
                    j += 1
                if j >= n or t[j] in ",}]:":
                    in_str = False
                    out.append('"')
                else:
                    out.append('\\"')
                i += 1
                continue
            out.append(c)
            i += 1
        else:
            if c == '"':
                in_str = True
            out.append(c)
            i += 1
    return "".join(out)


def _strip_trailing_commas(t):
    import re
    return re.sub(r",\s*([}\]])", r"\1", t)


def _balance_brackets(t):
    """Close unbalanced strings/brackets (output truncated mid-object)."""
    stack = []
    in_str = False
    esc = False
    for c in t:
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c in "{[":
            stack.append("}" if c == "{" else "]")
        elif c in "}]" and stack:
            stack.pop()
    if in_str:
        t += '"'
    return t + "".join(reversed(stack))
