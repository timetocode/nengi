# Working on nengi

Before changing performance-sensitive channel, snapshot, serialization, client
history or sampling code, read [the performance record](./src/performance/PERFORMANCE.md)
and the relevant [harness guidance](./src/performance/README.md).

Preserve knowledge of the capabilities nengi has demonstrated. Use those results
to investigate substantially slower behavior in comparable workloads, including
changes motivated by correctness or simplification. Implementations may change;
explain measured tradeoffs and keep workload assumptions attached to the numbers.
The record describes intentions and evidence, not mandatory algorithms or
machine-independent timing thresholds.
