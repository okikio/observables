/**
 * Cross-library comparison benchmarks for equivalent observable scenarios.
 *
 * This focuses on runnable userland implementations:
 * - this library
 * - RxJS
 * - zen-observable
 * - es-observable (TC39-style package implementation)
 *
 * WICG Observable is currently spec/WPT-driven rather than a consumable runtime
 * package, so its contract is compared in tests rather than benchmarked here.
 */

import { bench, do_not_optimize, run } from "npm:mitata";
import { Observable as OkObservable } from "../observable.ts";
import { isObservableError } from "../error.ts";
import { pipe } from "../helpers/pipe.ts";
import {
  filter as okFilter,
  map as okMap,
  take as okTake,
} from "../helpers/operations/core.ts";
import {
  filter as rxFilter,
  from as rxFrom,
  map as rxMap,
  of as rxOf,
  take as rxTake,
} from "npm:rxjs@7.8.2";
import ZenObservable from "npm:zen-observable@0.10.0";
import { Observable as EsProposalObservable } from "npm:es-observable@2.0.5";

type MinimalObserver<T> = {
  next(value: T): void;
  complete(): void;
};

const range1000 = Array.from({ length: 1000 }, (_, index) => index);

bench("Compare: create single-value observable - okikio", () => {
  do_not_optimize(OkObservable.of(1));
});

bench("Compare: create single-value observable - rxjs", () => {
  do_not_optimize(rxOf(1));
});

bench("Compare: create single-value observable - zen-observable", () => {
  do_not_optimize(
    new ZenObservable((observer: MinimalObserver<number>) => {
      observer.next(1);
      observer.complete();
    }),
  );
});

bench("Compare: create single-value observable - es-observable", () => {
  do_not_optimize(
    new EsProposalObservable((observer: MinimalObserver<number>) => {
      observer.next(1);
      observer.complete();
    }),
  );
});

bench("Compare: subscribe single value - okikio", async () => {
  const values: number[] = [];

  await new Promise<void>((resolve) => {
    OkObservable.of(1).subscribe({
      next: (value) => values.push(value),
      complete: () => resolve(),
    });
  });

  do_not_optimize(values);
}).gc("inner");

bench("Compare: subscribe single value - rxjs", async () => {
  const values: number[] = [];

  await new Promise<void>((resolve) => {
    rxOf(1).subscribe({
      next: (value) => values.push(value),
      complete: () => resolve(),
    });
  });

  do_not_optimize(values);
}).gc("inner");

bench("Compare: subscribe single value - zen-observable", async () => {
  const values: number[] = [];

  await new Promise<void>((resolve) => {
    new ZenObservable((observer: MinimalObserver<number>) => {
      observer.next(1);
      observer.complete();
    }).subscribe({
      next(value: number) {
        values.push(value);
      },
      complete() {
        resolve();
      },
    });
  });

  do_not_optimize(values);
}).gc("inner");

bench("Compare: subscribe single value - es-observable", async () => {
  const values: number[] = [];

  await new Promise<void>((resolve) => {
    new EsProposalObservable((observer: MinimalObserver<number>) => {
      observer.next(1);
      observer.complete();
    }).subscribe({
      next(value: number) {
        values.push(value);
      },
      complete() {
        resolve();
      },
    });
  });

  do_not_optimize(values);
}).gc("inner");

bench("Compare: subscribe 1000 array values - okikio", async () => {
  const values: number[] = [];

  await new Promise<void>((resolve) => {
    OkObservable.from(range1000).subscribe({
      next: (value) => values.push(value),
      complete: () => resolve(),
    });
  });

  do_not_optimize(values);
}).gc("inner");

bench("Compare: subscribe 1000 array values - rxjs", async () => {
  const values: number[] = [];

  await new Promise<void>((resolve) => {
    rxFrom(range1000).subscribe({
      next: (value) => values.push(value),
      complete: () => resolve(),
    });
  });

  do_not_optimize(values);
}).gc("inner");

bench("Compare: subscribe 1000 array values - zen-observable", async () => {
  const values: number[] = [];

  await new Promise<void>((resolve) => {
    ZenObservable.from(range1000).subscribe({
      next(value: number) {
        values.push(value);
      },
      complete() {
        resolve();
      },
    });
  });

  do_not_optimize(values);
}).gc("inner");

bench("Compare: subscribe 1000 array values - es-observable", async () => {
  const values: number[] = [];

  await new Promise<void>((resolve) => {
    EsProposalObservable.from(range1000).subscribe({
      next(value: number) {
        values.push(value);
      },
      complete() {
        resolve();
      },
    });
  });

  do_not_optimize(values);
}).gc("inner");

bench("Compare: map/filter/take pipeline (1000 items) - okikio", async () => {
  const values: number[] = [];
  const result = pipe(
    OkObservable.from(range1000),
    okMap((value: number) => value + 1),
    okFilter((value: number) => value % 2 === 0),
    okTake(100),
  );

  for await (const value of result) {
    if (!isObservableError(value)) {
      values.push(value);
    }
  }

  do_not_optimize(values);
}).gc("inner");

bench("Compare: map/filter/take pipeline (1000 items) - rxjs", async () => {
  const values: number[] = [];

  await new Promise<void>((resolve) => {
    rxFrom(range1000)
      .pipe(
        rxMap((value: number) => value + 1),
        rxFilter((value: number) => value % 2 === 0),
        rxTake(100),
      )
      .subscribe({
        next: (value) => values.push(value),
        complete: () => resolve(),
      });
  });

  do_not_optimize(values);
}).gc("inner");

await run();
