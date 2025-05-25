import type { ObservableError } from "./error.ts";
import type { Operator } from "./utils.ts";

export type Expand<T> = T extends (a: infer A) => infer R
  ? (a: ExpandRecursively<A>) => ExpandRecursively<R>
  : T extends (...args: infer A) => infer R
  ? (...args: ExpandRecursively<A>) => ExpandRecursively<R>
  : T extends (infer Q)[] ? Q[]
  : T extends ReadableStream<infer Q> ? ReadableStream<Q>
  : T extends PromiseLike<infer Q> ? PromiseLike<Q>
  : T extends Iterable<infer Q> ? Iterable<Q>
  : T extends IterableIterator<infer Q> ? IterableIterator<Q>
  : T extends infer O
  ? { [K in keyof O]: O[K] }
  : never;

export type ExpandRecursively<T> = T extends (a: infer A) => infer R
  ? (a: ExpandRecursively<A>) => ExpandRecursively<R> 
  : T extends (...args: infer A) => infer R
    ? (...args: ExpandRecursively<A>) => ExpandRecursively<R>
  : T extends (infer Q)[] ? Q[]
  : T extends ReadableStream<infer Q> ? ReadableStream<Q>
    : T extends PromiseLike<infer Q> ? PromiseLike<Q>
    : T extends Iterable<infer Q> ? Iterable<Q>
    : T extends IterableIterator<infer Q> ? IterableIterator<Q>
    : T extends Error ? T
  : T extends object
  ? T extends infer O
? { [K in keyof O]: ExpandRecursively<O[K]> }
  : never
  : T;

// 1) Single type
type E1 = Expand<string>;
// = string
// | Iterable<string>
// | string[]
// | (Awaited<string> & {})

// 2) Two-member union
type E2 = Expand<Operator<number, ObservableError>>;
// = 'a'
// | Iterable<'a'>
// | 'a'[]
// | (Awaited<'a'> & {})
// | 42
// | Iterable<42>
// | 42[]
// | (Awaited<42> & {})
// // — plus —
// | Iterable<'a' | 42>
// | ('a' | 42)[]
// | (Awaited<'a' | 42> & {})

// 3) Promise + union
type E3 = Expand<Promise<boolean> | Date>;
// = Promise<boolean>
// | Iterable<Promise<boolean>>
// | Promise<boolean>[]
// | (boolean & {})
// | Date
// | Iterable<Date>
// | Date[]
// | (Awaited<Date> & {})
// // — plus —
// | Iterable<Promise<boolean> | Date>
// | (Promise<boolean> | Date)[]
// | (Awaited<Promise<boolean> | Date> & {})
