# Principles → features

In our own words, mapping public incident guidance to sdfr:

1. **Tamper-evident evidence** — hash-chained ledger + `sdfr verify` (Nadella-style insider-risk evidence).  
   Context: https://thenextweb.com/news/nadella-ai-models-insider-risks-emergency-brake
2. **Contain external side effects** — deny-by-default YAML policy for submit/send/create_account; sandbox internet proves denials never leave.  
   Context: Anthropic Claude false tip-off reporting — https://www.abc.net.au/news/2026-10-12/anthropic-claude-ai-model-false-murder-tip-off-explained/107254596
3. **Emergency brake** — `sdfr brake` / web button freezes sessions within 1s.
4. **Disclosure packet** — signed incident export with timeline, external hosts, checklist.
