/**
 * Main benchmark runner.
 *
 * Orchestrates all benchmark suites and generates a comprehensive performance report.
 * Run with: deno task bench
 */

console.log("═".repeat(80));
console.log("🚀 Observable Library Benchmark Suite");
console.log("═".repeat(80));
console.log("");

console.log("Running Observable benchmarks...");
console.log("-".repeat(80));
await import("./observable_bench.ts");

console.log("");
console.log("Running Queue benchmarks...");
console.log("-".repeat(80));
await import("./queue_bench.ts");

console.log("");
console.log("Running Operator Pipeline benchmarks...");
console.log("-".repeat(80));
await import("./operators_bench.ts");

console.log("");
console.log("Running Memory benchmarks...");
console.log("-".repeat(80));
await import("./memory_bench.ts");

console.log("");
console.log("Running Event benchmarks...");
console.log("-".repeat(80));
await import("./events_bench.ts");

console.log("");
console.log("Running Latency benchmarks...");
console.log("-".repeat(80));
await import("./latency_bench.ts");

console.log("");
console.log("═".repeat(80));
console.log("✅ All benchmarks complete");
console.log("═".repeat(80));
