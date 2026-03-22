// deno-lint-ignore-file no-import-prefix
import { expect, test } from 'jsr:@libs/testing@^5';

import type {
	ObservableProtocol,
	SpecObservable,
	SpecObserver,
	SpecSubscription,
} from '../../_spec.ts';

import {
	forEach,
	Observable,
	SubscriptionStateMap,
} from '../../observable.ts';
import { Symbol } from '../../symbol.ts';

test('subscribe preserves this for anonymous next observers', () => {
	const events: Array<string | number> = [];

	Observable.of(1).subscribe({
		label: 'next-context',
		next(value) {
			events.push(this.label);
			events.push(value);
		},
	} as {
		label: string;
		next(value: number): void;
	});

	expect(events).toEqual(['next-context', 1]);
});

test('subscribe preserves this for anonymous error and complete observers', () => {
	const events: string[] = [];

	new Observable<never>((observer) => {
		observer.error(new Error('boom'));
	}).subscribe({
		label: 'error-context',
		error(error) {
			events.push(`${this.label}:${(error as Error).message}`);
		},
	} as {
		label: string;
		error(error: unknown): void;
	});

	Observable.of().subscribe({
		label: 'complete-context',
		complete() {
			events.push(this.label);
		},
	} as {
		label: string;
		complete(): void;
	});

	expect(events).toEqual(['error-context:boom', 'complete-context']);
});

test('subscribe tolerates being called with no arguments', () => {
	const source = new Observable<string>((observer) => {
		observer.next('foo');
		observer.complete();
	});

	expect(() => {
		(source as unknown as { subscribe(): unknown }).subscribe();
	}).not.toThrow();
});

test('subscribe closes immediately for an already-aborted AbortSignal without running the subscriber', () => {
	const controller = new AbortController();
	controller.abort();

	let subscriberCalled = false;
	let start_closed: boolean | undefined;

	const subscription = new Observable<number>((observer) => {
		subscriberCalled = true;
		observer.next(1);
		return () => {};
	}).subscribe({
		start(sub) {
			start_closed = sub.closed;
		},
		next() {},
	}, { signal: controller.signal });

	expect(start_closed).toBe(true);
	expect(subscriberCalled).toBe(false);
	expect(subscription.closed).toBe(true);
	expect(SubscriptionStateMap.get(subscription)).toBe(undefined);
});

test('unsubscribing in start clears internal subscription state before the subscriber runs', () => {
	let subscriberCalled = false;
	let state_after_unsubscribe:
		| ReturnType<typeof SubscriptionStateMap.get>
		| undefined;

	const subscription = new Observable<number>((observer) => {
		subscriberCalled = true;
		observer.next(1);
		return () => {};
	}).subscribe({
		start(sub) {
			sub.unsubscribe();
			state_after_unsubscribe = SubscriptionStateMap.get(sub);
		},
		next() {},
	});

	expect(subscriberCalled).toBe(false);
	expect(subscription.closed).toBe(true);
	expect(state_after_unsubscribe).toBe(undefined);
});

test('subscribe tears down when AbortSignal aborts after subscription starts', async () => {
	const controller = new AbortController();
	const values: number[] = [];
	let cleanupCount = 0;

	const subscription = new Observable<number>((observer) => {
		let value = 0;
		const id = setInterval(() => observer.next(value++), 5);

		return () => {
			cleanupCount++;
			clearInterval(id);
		};
	}).subscribe({
		next(value) {
			values.push(value);
			if (value === 1) {
				controller.abort();
			}
		},
	}, { signal: controller.signal });

	await new Promise((resolve) => setTimeout(resolve, 30));

	expect(values).toEqual([0, 1]);
	expect(cleanupCount).toBe(1);
	expect(subscription.closed).toBe(true);
});

test('Observable.from stops a synchronous iterable when unsubscribed mid-drain', () => {
	const seen: number[] = [];
	const sideEffects: number[] = [];
	let iteratorClosed = false;
	let subscription:
		| {
			unsubscribe(): void;
		}
		| undefined;

	const iterable = {
		[Symbol.iterator]() {
			let index = 0;
			return {
				next() {
					sideEffects.push(index);
					return index < 10
						? { value: index++, done: false }
						: { value: undefined, done: true };
				},
				return() {
					iteratorClosed = true;
					return { value: undefined, done: true };
				},
			};
		},
	};

	Observable.from(iterable).subscribe({
		start(sub) {
			subscription = sub;
		},
		next(value) {
			seen.push(value!);
			if (value === 2) {
				subscription?.unsubscribe();
			}
		},
	});

	expect(seen).toEqual([0, 1, 2]);
	expect(sideEffects).toEqual([0, 1, 2]);
	expect(iteratorClosed).toBe(true);
});

test('Symbol.asyncIterator.throw unsubscribes the source', async () => {
	let state = 'idle';

	const source = new Observable<number>((observer) => {
		state = 'subscribed';
		observer.next(0);
		return () => {
			state = 'unsubscribed';
		};
	});

	const iterator = source[Symbol.asyncIterator]();

	expect(state).toBe('idle');
	await iterator.next();
	expect(state).toBe('subscribed');

	await expect(iterator.throw?.(new Error('wee!'))).rejects.toThrow('wee!');
	expect(state).toBe('unsubscribed');
});

test('forEach rejects if the callback is not a function', async () => {
	await expect(
		forEach(
			Observable.of(1, 2, 3),
			undefined as unknown as (value: number, index: number) => void,
		),
	).rejects.toThrow(TypeError);
});

test('forEach resolves with undefined when the source completes', async () => {
	const values: number[] = [];

	await expect(
		forEach(Observable.of(1, 2, 3), (value, index) => {
			values.push(value + index);
		}),
	).resolves.toBe(undefined);

	expect(values).toEqual([1, 3, 5]);
});

test('forEach rejects when the source errors', async () => {
	const error = new Error('bad');

	await expect(
		forEach(new Observable<number>((observer) => {
			observer.error(error);
		}), () => {}),
	).rejects.toBe(error);
});

test('forEach rejects if the callback throws and stops a synchronous source', async () => {
	const expected = new Error('NO THREES');
	const values: number[] = [];

	await expect(
		forEach(Observable.of(1, 2, 3, 4), (value) => {
			values.push(value);
			if (value === 3) {
				throw expected;
			}
		}),
	).rejects.toBe(expected);

	expect(values).toEqual([1, 2, 3]);
});

test('forEach unsubscribes a synchronous foreign source when the callback throws before subscribe returns', async () => {
	const expected = new Error('stop now');
	let unsubscribe_count = 0;
	const protocol: ObservableProtocol<number> = {
		subscribe(
			observer_or_next: SpecObserver<number> | ((value: number) => void),
		): SpecSubscription {
			const observer = typeof observer_or_next === 'function'
				? { next: observer_or_next }
				: observer_or_next;

			observer.next?.(1);

			return {
				unsubscribe() {
					unsubscribe_count++;
				},
			};
		},
	};

	const foreign: SpecObservable<number> = {
		[Symbol.observable]() {
			return protocol;
		},
	};

	await expect(
		forEach(foreign, () => {
			throw expected;
		}),
	).rejects.toBe(expected);

	expect(unsubscribe_count).toBe(1);
});

test('forEach rejects if the callback throws and tears down an async source', async () => {
	const expected = new Error('NO TWOS');
	const values: number[] = [];
	let cleanupCount = 0;

	await expect(
		forEach(new Observable<number>((observer) => {
			let value = 1;
			const id = setInterval(() => observer.next(value++), 1);

			return () => {
				cleanupCount++;
				clearInterval(id);
			};
		}), (value) => {
			values.push(value);
			if (value === 2) {
				throw expected;
			}
		}),
	).rejects.toBe(expected);

	expect(values).toEqual([1, 2]);
	expect(cleanupCount).toBe(1);
});

test('Observable.prototype.forEach delegates to the exported helper', async () => {
	const values: string[] = [];

	await expect(
		Observable.of('a', 'b').forEach((value, index) => {
			values.push(`${index}:${value}`);
		}),
	).resolves.toBe(undefined);

	expect(values).toEqual(['0:a', '1:b']);
});

test('forEach rejects when its AbortSignal aborts', async () => {
	const controller = new AbortController();
	const reason = new Error('aborted');
	const values: number[] = [];
	let cleanupCount = 0;

	await expect(
		forEach(new Observable<number>((observer) => {
			let value = 0;
			const id = setInterval(() => observer.next(value++), 5);

			return () => {
				cleanupCount++;
				clearInterval(id);
			};
		}), (value) => {
			values.push(value);
			if (value === 1) {
				controller.abort(reason);
			}
		}, { signal: controller.signal }),
	).rejects.toBe(reason);

	expect(values).toEqual([0, 1]);
	expect(cleanupCount).toBe(1);
});
