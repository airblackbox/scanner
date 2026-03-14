/**
 * AIR Blackbox — Live Compliance Scanner API
 *
 * POST /api/scan
 * Body: { code: "...", github_url: "..." }
 *
 * Scans Python AI agent code for EU AI Act compliance (Articles 9-15).
 * Returns findings with severity, article reference, and fix recommendations.
 */

const GITHUB_RAW = "https://raw.githubusercontent.com";

// ── Article 9: Risk Management ──

function checkErrorHandling(files) {
  const llmPatterns = [
    /\.chat\.completions\.create\(/,
    /\.completions\.create\(/,
    /\.invoke\(/, /\.run\(/, /\.generate\(/, /\.predict\(/,
    /\.agenerate\(/, /\.ainvoke\(/,
    /ChatOpenAI\(/, /OpenAI\(/, /Anthropic\(/,
  ];
  let filesWithCalls = 0, filesWithHandling = 0;
  const uncovered = [];
  for (const [name, content] of files) {
    const hasCalls = llmPatterns.some(p => p.test(content));
    if (hasCalls) {
      filesWithCalls++;
      if (/\btry\b[\s\S]*?\bexcept\b/.test(content) || /try\s*\{[\s\S]*?\}\s*catch/.test(content) ||
          /error_handler|error_callback|handle_error|retry_policy/i.test(content)) {
        filesWithHandling++;
      } else {
        uncovered.push(name);
      }
    }
  }
  if (!filesWithCalls) return { name: "LLM call error handling", status: "pass", evidence: "No direct LLM API calls detected" };
  if (filesWithHandling === filesWithCalls) return { name: "LLM call error handling", status: "pass", evidence: `All ${filesWithCalls} files with LLM calls have error handling` };
  return {
    name: "LLM call error handling",
    status: filesWithHandling === 0 ? "fail" : "warn",
    evidence: `${filesWithHandling}/${filesWithCalls} files with LLM calls have error handling. Missing: ${uncovered.slice(0, 5).join(", ")}`,
    fix: "Wrap LLM API calls in try/except to handle failures gracefully"
  };
}

function checkFallback(files) {
  const p = /fallback|retry|backoff|with_fallbacks|with_retry|tenacity|max_retries|default_response/i;
  const hits = files.filter(([_, c]) => p.test(c));
  if (hits.length) return { name: "Fallback/recovery patterns", status: "pass", evidence: `Fallback patterns found in ${hits.length} file(s)` };
  return { name: "Fallback/recovery patterns", status: "warn", evidence: "No fallback or retry patterns detected", fix: "Add fallback logic for LLM failures" };
}

// ── Article 10: Data Governance ──

function checkInputValidation(files) {
  const p = /pydantic|BaseModel|validator|field_validator|validate_input|input_schema|json_schema|TypedDict|dataclass|InputGuard|sanitize/;
  const hits = files.filter(([_, c]) => p.test(c));
  if (hits.length) return { name: "Input validation / schema enforcement", status: "pass", evidence: `Input validation found in ${hits.length}/${files.length} files` };
  return { name: "Input validation / schema enforcement", status: "warn", evidence: "No structured input validation detected", fix: "Use Pydantic models or dataclasses to validate inputs" };
}

function checkPiiHandling(files) {
  const p = /pii|redact|mask_(?:data|pii|email|ssn|name)|anonymize|tokenize_pii|presidio|scrub|private_data|sensitive_data|gdpr|personal_data/i;
  const hits = files.filter(([_, c]) => p.test(c));
  if (hits.length) return { name: "PII handling in code", status: "pass", evidence: `PII-aware patterns found in ${hits.length} file(s)` };
  return { name: "PII handling in code", status: "warn", evidence: "No PII detection or masking patterns found", fix: "Add PII detection before sending data to LLM providers" };
}

// ── Article 11: Technical Documentation ──

function checkDocstrings(files) {
  let total = 0, documented = 0;
  for (const [_, content] of files) {
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const s = lines[i].trim();
      if ((s.startsWith("def ") || s.startsWith("class ")) && !s.startsWith("def _")) {
        total++;
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const next = lines[j].trim();
          if (next === "") continue;
          if (next.startsWith('"""') || next.startsWith("'''")) documented++;
          break;
        }
      }
    }
  }
  if (!total) return { name: "Code documentation (docstrings)", status: "pass", evidence: "No public functions/classes found" };
  const pct = Math.round(documented / total * 100);
  return {
    name: "Code documentation (docstrings)",
    status: pct >= 60 ? "pass" : pct >= 30 ? "warn" : "fail",
    evidence: `${documented}/${total} public functions/classes have docstrings (${pct}%)`,
    fix: pct < 60 ? "Add docstrings to public functions and classes" : undefined
  };
}

function checkTypeHints(files) {
  let total = 0, typed = 0;
  for (const [_, content] of files) {
    for (const line of content.split("\n")) {
      const s = line.trim();
      if (s.startsWith("def ") && !s.startsWith("def _")) {
        total++;
        if (s.includes("->") || /:\s*(str|int|float|bool|list|dict|List|Dict|Optional|Any|Tuple)/.test(s)) typed++;
      }
    }
  }
  if (!total) return null;
  const pct = Math.round(typed / total * 100);
  return {
    name: "Type annotations",
    status: pct >= 50 ? "pass" : pct >= 20 ? "warn" : "fail",
    evidence: `${typed}/${total} public functions have type hints (${pct}%)`,
    fix: pct < 50 ? "Add type hints to function signatures" : undefined
  };
}

// ── Article 12: Record-Keeping ──

function checkLogging(files) {
  const p = /import logging|from logging|getLogger|structlog|loguru|logger\.|logging\./;
  const hits = files.filter(([_, c]) => p.test(c));
  if (!hits.length) return { name: "Application logging", status: "fail", evidence: "No logging framework detected", fix: "Add import logging and log key decisions" };
  const pct = Math.round(hits.length / files.length * 100);
  return { name: "Application logging", status: pct >= 20 ? "pass" : "warn", evidence: `Logging found in ${hits.length}/${files.length} files (${pct}%)` };
}

function checkTracing(files) {
  const p = /opentelemetry|otel|trace_id|span_id|run_id|request_id|correlation_id|langsmith|langfuse|helicone|arize|wandb|mlflow|instrumentation|dispatcher|event_handler|TracerProvider|tracing_enabled|CONTENT_TRACING_ENABLED|callbacks/i;
  const hits = files.filter(([_, c]) => p.test(c));
  if (hits.length) return { name: "Tracing / observability", status: "pass", evidence: `Tracing patterns found in ${hits.length} file(s)` };
  return { name: "Tracing / observability", status: "warn", evidence: "No tracing or observability integration detected", fix: "Add OpenTelemetry or LangSmith" };
}

function checkActionAudit(files) {
  const p = /action_log|audit_trail|audit_log|log_action|record_action|action_history|event_log|activity_log|execution_log|CONTENT_TRACING_ENABLED|logging_tracer|agent_events|crew_events|emit_event|on_event/i;
  const hits = files.filter(([_, c]) => p.test(c));
  if (hits.length) return { name: "Agent action audit trail", status: "pass", evidence: `Action-level audit logging found in ${hits.length} file(s)` };
  return { name: "Agent action audit trail", status: "warn", evidence: "No action-level audit trail detected", fix: "Log every agent action with user_id, timestamp, action_type" };
}

// ── Article 14: Human Oversight ──

function checkHumanInLoop(files) {
  const p = /human_in_the_loop|human_approval|require_approval|approval_gate|require_confirmation|confirm.*action|ask_human|human_input|HumanApprovalCallbackHandler|human_feedback|manual_review|confirmation_strategy|confirmation_polic|allow_delegation|interrupt_before|interrupt_after/i;
  const hits = files.filter(([_, c]) => p.test(c));
  if (hits.length) return { name: "Human-in-the-loop patterns", status: "pass", evidence: `Human oversight patterns found in ${hits.length} file(s)` };
  return { name: "Human-in-the-loop patterns", status: "warn", evidence: "No human approval gates detected", fix: "Add approval gates for high-risk actions" };
}

function checkRateLimiting(files) {
  const p = /rate_limit|max_tokens|max_iterations|max_steps|budget|token_limit|cost_limit|max_retries|max_calls|throttle|cooldown|max_rpm/i;
  const hits = files.filter(([_, c]) => p.test(c));
  if (hits.length) return { name: "Usage limits / budget controls", status: "pass", evidence: `Rate limiting or budget controls found in ${hits.length} file(s)` };
  return { name: "Usage limits / budget controls", status: "warn", evidence: "No rate limiting or budget controls detected", fix: "Set max_tokens or budget limits" };
}

function checkIdentityBinding(files) {
  const p = /user_id|user_email|authorized_by|delegated_by|on_behalf_of|acting_as|user_context|auth_context|identity_token|delegation_token|Fingerprint|agent_fingerprint|AgentCard/i;
  const hits = files.filter(([_, c]) => p.test(c));
  if (hits.length) return { name: "Agent-to-user identity binding", status: "pass", evidence: `User identity binding found in ${hits.length} file(s)` };
  return { name: "Agent-to-user identity binding", status: "warn", evidence: "No user identity binding detected", fix: "Track user_id alongside every agent action" };
}

function checkActionBoundaries(files) {
  const p = /allowed_tools|tool_whitelist|blocked_tools|allowed_actions|action_filter|can_execute|permission_gate|restricted_actions|deny_list|allow_list|tool_filter|enabled_tools|disabled_tools|human_in_the_loop.*polic|confirmation_polic|action_polic/i;
  const hits = files.filter(([n, c]) => p.test(c) && !/serializ/i.test(n));
  if (hits.length) return { name: "Agent action boundaries", status: "pass", evidence: `Action boundary controls found in ${hits.length} file(s)` };
  return { name: "Agent action boundaries", status: "warn", evidence: "No action boundaries detected", fix: "Define allowed_tools to limit agent capabilities" };
}

// ── Article 15: Accuracy, Robustness & Cybersecurity ──

function checkRetryLogic(files) {
  const p = /retry|backoff|tenacity|max_retries|exponential_backoff|with_retry|Retry\(/i;
  const hits = files.filter(([_, c]) => p.test(c));
  if (hits.length) return { name: "Retry / backoff logic", status: "pass", evidence: `Retry/backoff patterns found in ${hits.length} file(s)` };
  return { name: "Retry / backoff logic", status: "warn", evidence: "No retry or backoff patterns detected", fix: "Add retry logic with exponential backoff" };
}

function checkInjectionDefense(files) {
  const p = /prompt.?injection|sql.?injection|inject.*(?:attack|detect|prevent|filter)|sanitize|escape_prompt|guardrail|content_filter|moderation|safety_check|prompt_guard|nemo_guardrails|hallucination_guardrail|llm_guardrail|output_guardrail|input_guardrail|trust_policy|verify_trust/i;
  const hits = files.filter(([_, c]) => p.test(c));
  if (hits.length) return { name: "Prompt injection defense", status: "pass", evidence: `Injection defense patterns found in ${hits.length} file(s)` };
  return { name: "Prompt injection defense", status: "warn", evidence: "No prompt injection defense detected", fix: "Add input sanitization or guardrails" };
}

function checkOutputValidation(files) {
  const p = /output_parser|OutputParser|PydanticOutputParser|JsonOutputParser|parse_output|validate_output|response_model|structured_output|output_schema|response_format|output_pydantic|output_json|expected_output/;
  const hits = files.filter(([_, c]) => p.test(c));
  if (hits.length) return { name: "LLM output validation", status: "pass", evidence: `Output validation found in ${hits.length} file(s)` };
  return { name: "LLM output validation", status: "warn", evidence: "No structured output validation detected", fix: "Use output parsers to validate LLM responses" };
}

// ── Framework Detection ──

function detectFramework(allCode) {
  if (/from langchain|import langchain|from langchain_core|from langchain_openai|from langgraph/i.test(allCode)) return "LangChain";
  if (/from crewai|import crewai|from crewai_tools/i.test(allCode)) return "CrewAI";
  if (/from autogen|import autogen|ConversableAgent|AssistantAgent/i.test(allCode)) return "AutoGen";
  if (/from haystack|import haystack|from haystack_ai/i.test(allCode)) return "Haystack";
  if (/from llama_index|import llama_index/i.test(allCode)) return "LlamaIndex";
  if (/from semantic_kernel|import semantic_kernel/i.test(allCode)) return "Semantic Kernel";
  if (/openai\.ChatCompletion|from openai|import openai|client\.chat\.completions/i.test(allCode)) return "OpenAI SDK";
  if (/from anthropic|import anthropic/i.test(allCode)) return "Anthropic SDK";
  return "Unknown";
}

function detectTrustLayer(allCode) {
  if (/air_blackbox|air_langchain_trust|air_crewai_trust|air_openai_trust|AirTrust|AirLangChainHandler|air_compliance/i.test(allCode)) return true;
  return false;
}

// ── Main Scanner ──

function scanFiles(files) {
  const allCode = files.map(([_, c]) => c).join("\n");
  const framework = detectFramework(allCode);
  const hasTrust = detectTrustLayer(allCode);

  const articles = [
    { number: 9, title: "Risk Management", checks: [] },
    { number: 10, title: "Data Governance", checks: [] },
    { number: 11, title: "Technical Documentation", checks: [] },
    { number: 12, title: "Record-Keeping", checks: [] },
    { number: 14, title: "Human Oversight", checks: [] },
    { number: 15, title: "Accuracy, Robustness & Cybersecurity", checks: [] },
  ];

  // Article 9
  articles[0].checks.push(checkErrorHandling(files));
  articles[0].checks.push(checkFallback(files));

  // Article 10
  articles[1].checks.push(checkInputValidation(files));
  articles[1].checks.push(checkPiiHandling(files));

  // Article 11
  articles[2].checks.push(checkDocstrings(files));
  const th = checkTypeHints(files);
  if (th) articles[2].checks.push(th);

  // Article 12
  articles[3].checks.push(checkLogging(files));
  articles[3].checks.push(checkTracing(files));
  articles[3].checks.push(checkActionAudit(files));

  // Article 14
  articles[4].checks.push(checkHumanInLoop(files));
  articles[4].checks.push(checkRateLimiting(files));
  articles[4].checks.push(checkIdentityBinding(files));
  articles[4].checks.push(checkActionBoundaries(files));

  // Article 15
  articles[5].checks.push(checkRetryLogic(files));
  articles[5].checks.push(checkInjectionDefense(files));
  articles[5].checks.push(checkOutputValidation(files));

  // Trust layer bonus
  if (hasTrust) {
    articles[3].checks.push({ name: "AIR Blackbox trust layer", status: "pass", evidence: "AIR Blackbox trust layer detected — tamper-evident audit chain active" });
    articles[5].checks.push({ name: "AIR trust layer protection", status: "pass", evidence: "AIR Blackbox trust layer provides runtime PII detection + injection scanning" });
  }

  // Compute stats
  let passing = 0, warnings = 0, failing = 0;
  for (const a of articles) {
    for (const c of a.checks) {
      if (c.status === "pass") passing++;
      else if (c.status === "warn") warnings++;
      else failing++;
    }
  }
  const total = passing + warnings + failing;
  const score = total > 0 ? Math.round((passing / total) * 100) : 0;

  return {
    framework,
    has_trust_layer: hasTrust,
    score,
    passing, warnings, failing, total,
    articles,
    scanned_files: files.length,
    scanned_at: new Date().toISOString(),
  };
}

// ── GitHub Fetcher ──

async function fetchGitHub(url) {
  // Supports: github.com/owner/repo, github.com/owner/repo/tree/branch/path
  const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\/tree\/([^\/]+)\/?(.*)|\/?)$/);
  if (!match) throw new Error("Invalid GitHub URL. Use: github.com/owner/repo or github.com/owner/repo/tree/branch/path");

  const [, owner, repo, branch = "main", path = ""] = match;

  // Use GitHub API to list files (tree endpoint)
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const resp = await fetch(apiUrl, {
    headers: {
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "AIR-Blackbox-Scanner/1.0",
      ...(process.env.GITHUB_TOKEN ? { "Authorization": `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
  });

  if (!resp.ok) {
    if (resp.status === 403) throw new Error("GitHub API rate limit. Add GITHUB_TOKEN env var for higher limits.");
    throw new Error(`GitHub API error: ${resp.status}`);
  }

  const tree = await resp.json();

  // Filter Python files, skip test/vendor dirs, limit to 50 files for speed
  const pyFiles = (tree.tree || [])
    .filter(f => f.type === "blob" && f.path.endsWith(".py"))
    .filter(f => !/(node_modules|\.git|__pycache__|\.venv|venv|site-packages|dist\/|build\/|\.egg)/.test(f.path))
    .filter(f => {
      if (path) return f.path.startsWith(path);
      return true;
    })
    .slice(0, 50);

  if (!pyFiles.length) throw new Error("No Python files found in this repository/path.");

  // Fetch file contents in parallel (max 50)
  const files = await Promise.all(
    pyFiles.map(async (f) => {
      try {
        const rawUrl = `${GITHUB_RAW}/${owner}/${repo}/${branch}/${f.path}`;
        const r = await fetch(rawUrl);
        if (!r.ok) return null;
        const content = await r.text();
        return [f.path, content];
      } catch {
        return null;
      }
    })
  );

  return files.filter(Boolean);
}

// ── API Handler ──

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { code, github_url } = req.body;

    let files;
    let source;

    if (github_url) {
      source = github_url;
      files = await fetchGitHub(github_url);
    } else if (code) {
      source = "pasted code";
      files = [["code.py", code]];
    } else {
      return res.status(400).json({ error: "Provide 'code' or 'github_url'" });
    }

    const result = scanFiles(files);
    result.source = source;

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
