// deno-lint-ignore-file no-import-prefix
/**
 * Interop-focused benchmarks.
 *
 * These scenarios measure the cost of the new adapter helpers against the
 * closest direct baseline so interop convenience does not hide avoidable
 * overhead.
 */

import { bench, do_not_optimize, run } from "npm:mitata@^1.0.34";
import {
  from as rxFrom,
  map as rxMap,
  type Observable as RxObservable,
  pipe as rxPipe,
  take as rxTake,
} from "npm:rxjs@7.8.2";

import { isObservableError } from "../error.ts";
import { ignoreErrors } from "../helpers/operations/errors.ts";
import { map, take } from "../helpers/operations/core.ts";
import { pipe } from "../helpers/pipe.ts";
import {
  applyOperator,
  fromObservableOperator,
  fromStreamPair,
  toStream,
} from "../helpers/utils.ts";
import { Observable } from "../observable.ts";

const range1000 = Array.from({ length: 1000 }, (_, index) => index);

async function collectReadable<T>(stream: ReadableStream<T>): Promise<T[]> {
  const values: T[] = [];
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      values.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return values;
}

async function collectObservable<T>(observable: Observable<T>): Promise<T[]> {
  const values: T[] = [];

  for await (const value of observable) {
    if (!isObservableError(value)) {
      values.push(value);
    }
  }

  return values;
}

function collectObservableBySubscription<T>(
  observable: Observable<T>,
): Promise<T[]> {
  const values: T[] = [];

  return new Promise<T[]>((resolve, reject) => {
    observable.subscribe({
      next(value) {
        if (!isObservableError(value)) {
          values.push(value);
        }
      },
      error(error) {
        reject(error);
      },
      complete() {
        resolve(values);
      },
    });
  });
}

bench("Interop: direct TransformStream pair (1000 items)", async () => {
  const transform = new TransformStream<number, string>({
    transform(chunk, controller) {
      controller.enqueue(String(chunk));
    },
  });

  const values = await collectReadable(
    toStream(range1000).pipeThrough(transform),
  );

  do_not_optimize(values);
}).gc("inner");

bench("Interop: fromStreamPair wrapper (1000 items)", async () => {
  const stringify = fromStreamPair<number, string>(() => {
    const transform = new TransformStream<number, string>({
      transform(chunk, controller) {
        controller.enqueue(String(chunk));
      },
    });

    return {
      readable: transform.readable,
      writable: transform.writable,
    };
  });

  const values = await collectReadable(applyOperator(toStream(range1000), stringify));

  do_not_optimize(values);
}).gc("inner");

bench("Interop: local map/take pipeline via async iteration (1000 items)", async () => {
  const result = pipe(
    Observable.from(range1000),
    map((value: number) => value + 1),
    take(100),
  );

  const values = await collectObservable(result);

  do_not_optimize(values);
}).gc("inner");

bench("Interop: local map/take pipeline via subscribe (1000 items)", async () => {
  const result = pipe(
    Observable.from(range1000),
    map((value: number) => value + 1),
    take(100),
  );

  const values = await collectObservableBySubscription(result);

  do_not_optimize(values);
}).gc("inner");

bench("Interop: RxJS via fromObservableOperator via async iteration (1000 items)", async () => {
  const rxOperator = fromObservableOperator<
    number,
    number,
    RxObservable<number>
  >(
    rxPipe(
      rxMap((value: number) => value + 1),
      rxTake(100),
    ),
    { sourceAdapter: (source) => rxFrom(source) as RxObservable<number> },
  );

  const result = pipe(
    Observable.from(range1000),
    ignoreErrors(),
    rxOperator,
  );

  const values = await collectObservable(result);

  do_not_optimize(values);
}).gc("inner");

bench("Interop: RxJS via fromObservableOperator via subscribe (1000 items)", async () => {
  const rxOperator = fromObservableOperator<
    number,
    number,
    RxObservable<number>
  >(
    rxPipe(
      rxMap((value: number) => value + 1),
      rxTake(100),
    ),
    { sourceAdapter: (source) => rxFrom(source) as RxObservable<number> },
  );

  const result = pipe(
    Observable.from(range1000),
    ignoreErrors(),
    rxOperator,
  );

  const values = await collectObservableBySubscription(result);

  do_not_optimize(values);
}).gc("inner");

bench("Interop: direct RxJS pipeline (1000 items)", async () => {
  const values: number[] = [];

  await new Promise<void>((resolve) => {
    rxFrom(range1000)
      .pipe(
        rxMap((value: number) => value + 1),
        rxTake(100),
      )
      .subscribe({
        next(value) {
          values.push(value);
        },
        complete() {
          resolve();
        },
      });
  });

  do_not_optimize(values);
}).gc("inner");

await run();