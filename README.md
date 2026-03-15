# AIR Blackbox Scanner

Live EU AI Act compliance scanner for Python AI agent code. Paste code or point it at a GitHub repo — get an instant compliance report against Articles 9–15.

**Try it now:** [scan.airblackbox.ai](https://scan.airblackbox.ai)

## What it checks

The scanner runs 15+ automated checks mapped to EU AI Act requirements for high-risk AI systems:

| Article | Checks |
|---------|--------|
| **Art. 9** — Risk Management | LLM call error handling, fallback/recovery patterns |
| **Art. 10** — Data Governance | Input validation (Pydantic, dataclasses), PII handling |
| **Art. 11** — Technical Documentation | Docstring coverage, type annotation coverage |
| **Art. 12** — Record-Keeping | Application logging, tracing/observability, action audit trails |
| **Art. 14** — Human Oversight | Human-in-the-loop gates, rate/budget limits, identity binding, action boundaries |
| **Art. 15** — Robustness & Security | Retry/backoff logic, prompt injection defense, LLM output validation |

Each check returns **pass**, **warn**, or **fail** with evidence and fix recommendations.

## Supported frameworks

LangChain, CrewAI, AutoGen, Haystack, LlamaIndex, Semantic Kernel, OpenAI SDK, and Anthropic SDK.

## API usage

```bash
# Scan a GitHub repository
curl -X POST https://scan.airblackbox.ai/api/scan \
  -H "Content-Type: application/json" \
  -d '{"github_url": "https://github.com/deepset-ai/haystack"}'

# Scan pasted code
curl -X POST https://scan.airblackbox.ai/api/scan \
  -H "Content-Type: application/json" \
  -d '{"code": "from langchain_openai import ChatOpenAI\n\nllm = ChatOpenAI()\nresult = llm.invoke(\"hello\")"}'
```

### Response format

```json
{
  "framework": "Haystack",
  "score": 86,
  "passing": 12,
  "warnings": 2,
  "failing": 0,
  "total": 14,
  "scanned_files": 200,
  "articles": [
    {
      "number": 9,
      "title": "Risk Management",
      "checks": [
        {
          "name": "LLM call error handling",
          "status": "pass",
          "evidence": "52/127 files with LLM calls have error handling"
        }
      ]
    }
  ]
}
```

## How it works

1. **GitHub mode:** Fetches up to 200 Python files via the GitHub API (prioritizes source code over tests)
2. **Paste mode:** Scans a single code snippet
3. Runs regex-based pattern matching for each compliance check
4. Detects the AI framework in use
5. Returns a scored report with per-article breakdown

## Architecture

```
scanner/
├── api/scan.js        # Serverless API endpoint (Vercel)
├── public/index.html  # Web UI
├── vercel.json        # Deployment config
└── package.json
```

Deployed as a Vercel serverless function. No backend state, no database — each scan is stateless.

## Related projects

This is the web scanner. The full AIR Blackbox ecosystem includes:

- **[air-blackbox](https://pypi.org/project/air-blackbox/)** — Python SDK with CLI scanner, compliance engine, and trust layer
- **[air-langchain-trust](https://pypi.org/project/air-langchain-trust/)** — LangChain trust layer integration
- **[air-crewai-trust](https://pypi.org/project/air-crewai-trust/)** — CrewAI trust layer integration
- **[air-openai-trust](https://pypi.org/project/air-openai-trust/)** — OpenAI SDK trust layer integration

Install the SDK for local scanning and CI/CD integration:

```bash
pip install air-blackbox
air-blackbox scan ./my-agent-project
```

## EU AI Act deadline

The EU AI Act requirements for high-risk AI systems take effect **August 2, 2026**. This scanner helps development teams assess their compliance posture before the deadline.

## License

AGPL-3.0 — see [gateway repo](https://github.com/airblackbox/gateway) for full license.

## Contributing

Bug reports and feature requests welcome — [open an issue](https://github.com/airblackbox/scanner/issues).
