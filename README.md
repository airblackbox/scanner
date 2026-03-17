# AIR Blackbox Scanner

EU AI Act compliance scanner for Python AI agents. Scan your code against Articles 9–15 and get a scored report with evidence and fix recommendations.

**Try it now:** [scan.airblackbox.ai](https://scan.airblackbox.ai)

## How it works

The scanner has two modes — a **web scanner** for quick assessments and a **CLI scanner** for deep, hybrid analysis.

### Web scanner (this repo)

Paste code or point it at a GitHub repo. The web scanner fetches up to 200 Python files via the GitHub API, runs regex-based pattern matching, and returns a compliance report in seconds. No signup, no API keys.

```bash
# Scan a GitHub repository
curl -X POST https://scan.airblackbox.ai/api/scan \
  -H "Content-Type: application/json" \
  -d '{"github_url": "https://github.com/crewAIInc/crewAI"}'
```

### CLI scanner (hybrid engine)

The CLI adds a **fine-tuned AI model** that runs locally alongside the rule-based engine. Your code never leaves your machine.

```bash
pip install air-blackbox
air-blackbox setup                    # pulls the local AI model (~1GB)
air-blackbox comply --scan . -v --deep   # full hybrid scan
```

The hybrid engine works in three stages:

**1. Rule-based scan** — Regex patterns scan every Python file in your project. Each check uses strong vs. weak pattern separation to avoid false positives. For example, finding `presidio` or `scrubadub` (strong) triggers a PASS on PII handling, but finding a bare `pii` variable name (weak) only triggers a WARN.

**2. AI model analysis** — A fine-tuned compliance model (running locally via Ollama) analyzes a smart sample of your most compliance-relevant files. It provides deeper analysis with specific file and function citations.

**3. Smart reconciliation** — The two engines are merged. When the AI model says FAIL but the rule-based scanner found multiple passing checks across the full codebase, the rule-based evidence takes priority. This gives you the breadth of regex (every file) with the depth of AI analysis.

## What it checks

The scanner maps 20+ automated checks to 6 EU AI Act articles:

| Article | What the scanner looks for |
|---------|---------------------------|
| **Art. 9** — Risk Management | Error handling around LLM calls, fallback/recovery patterns, circuit breakers, risk assessment docs |
| **Art. 10** — Data Governance | Input validation (Pydantic, dataclasses), PII detection/redaction libraries, data governance docs |
| **Art. 11** — Technical Documentation | Docstring coverage, type annotation coverage, README, model cards |
| **Art. 12** — Record-Keeping | Application logging, tracing/observability (OpenTelemetry, Langfuse, LangSmith), action audit trails |
| **Art. 14** — Human Oversight | Human-in-the-loop approval gates, kill switches, rate/budget limits, identity binding, action boundaries, token scope validation |
| **Art. 15** — Robustness & Security | Prompt injection defense, output validation, retry/backoff logic, adversarial testing evidence |

Each check returns **pass**, **warn**, or **fail** with evidence citing specific files and patterns found.

## Benchmark results

We validated the scanner against three production AI frameworks:

| Article | CrewAI | LangFlow | Quivr |
|---------|--------|----------|-------|
| Art. 9 — Risk Management | ⚠️ WARN | ⚠️ WARN | ⚠️ WARN |
| Art. 10 — Data Governance | ⚠️ WARN | ⚠️ WARN | ⚠️ WARN |
| Art. 11 — Technical Docs | ✅ PASS | ✅ PASS | ✅ PASS |
| Art. 12 — Record-Keeping | ✅ PASS | ✅ PASS | ⚠️ WARN |
| Art. 14 — Human Oversight | ✅ PASS | ✅ PASS | ⚠️ WARN |
| Art. 15 — Accuracy & Security | ✅ PASS | ✅ PASS | ⚠️ WARN |
| **Total** | **4/6** | **4/6** | **1/6** |

Validation accuracy: CrewAI 100%, LangFlow 83%, Quivr 83%. We share scan results with each framework team and iterate based on their feedback.

## Before and after

Here's what a typical scan looks like for a LangChain agent before and after adding compliance infrastructure:

**Before** — A standard LangChain agent with no compliance coverage:
```
Static analysis:  6/25 passing
13 passing  19 warnings  6 failing
```

**After** — Same agent with error handling, input validation, PII redaction, logging, and the AIR Blackbox trust layer:
```
Static analysis:  11/25 passing
18 passing  15 warnings  5 failing
```

The demo files are in the [gateway repo](https://github.com/airblackbox/gateway/tree/main/demo/langchain-before-after). Single-file scanning is supported:

```bash
air-blackbox comply --scan ./agent_before.py -v
air-blackbox comply --scan ./agent_after.py -v
```

## Supported frameworks

LangChain, CrewAI, AutoGen, Haystack, LlamaIndex, Semantic Kernel, LangFlow, Quivr, OpenAI SDK, and Anthropic SDK.

## The full ecosystem

The scanner is the starting point. Once you know where your gaps are:

| Step | Tool | What it does |
|------|------|-------------|
| **1. Scan** | [scanner](https://github.com/airblackbox/scanner) (this repo) | Find compliance gaps in your code |
| **2. Fix** | [air-blackbox CLI](https://pypi.org/project/air-blackbox/) | Deep hybrid scan with AI model + fix recommendations |
| **3. Record** | [gateway](https://github.com/airblackbox/gateway) | Record every LLM call into a tamper-evident audit trail |
| **4. Integrate** | Trust layers ([LangChain](https://pypi.org/project/air-langchain-trust/), [CrewAI](https://pypi.org/project/air-crewai-trust/), [OpenAI](https://pypi.org/project/air-openai-trust/), [ADK](https://github.com/airblackbox/air-adk-trust)) | Drop-in compliance for your framework |
| **5. Deploy** | [air-platform](https://github.com/airblackbox/air-platform) | Full-stack deployment with gateway, policy engine, and Jaeger |
| **6. Automate** | [compliance-action](https://github.com/airblackbox/compliance-action) | GitHub Action that runs compliance checks on every PR |

## API reference

### Scan a GitHub repository

```bash
curl -X POST https://scan.airblackbox.ai/api/scan \
  -H "Content-Type: application/json" \
  -d '{"github_url": "https://github.com/deepset-ai/haystack"}'
```

### Scan pasted code

```bash
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

## Architecture

```
scanner/
├── api/scan.js        # Serverless API endpoint (Vercel)
├── public/index.html  # Web UI
├── vercel.json        # Deployment config
└── package.json
```

The web scanner is deployed as a Vercel serverless function. Stateless — no backend, no database. The CLI scanner lives in the [gateway repo](https://github.com/airblackbox/gateway/tree/main/sdk).

## EU AI Act deadline

The EU AI Act requirements for high-risk AI systems take effect **August 2, 2026**. This scanner helps development teams assess their technical compliance posture before the deadline. It checks technical requirements — it's a linter for AI governance, not a legal compliance tool.

## License

Apache-2.0

## Contributing

Bug reports and feature requests welcome — [open an issue](https://github.com/airblackbox/scanner/issues).
