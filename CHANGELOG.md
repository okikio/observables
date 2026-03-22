# [1.4.0](https://github.com/okikio/observables/compare/v1.3.0...v1.4.0) (2026-03-22)


### Bug Fixes

* improve subscription handling with early abort detection and cleanup ([ecd1dcc](https://github.com/okikio/observables/commit/ecd1dcc7a9c50788d81308d7e6c7525409ff3532))


### Features

* add forEach method to Observable class with detailed usage and behavior notes ([bd839e6](https://github.com/okikio/observables/commit/bd839e6e5b04f219bd66fae8df3e0dc4beca5e60))
* enhance observableInputToStream with improved error handling and subscription management ([c3c392e](https://github.com/okikio/observables/commit/c3c392eca34b9c82fc42504e6822fb8c06ddb404))

# [1.3.0](https://github.com/okikio/observables/compare/v1.2.0...v1.3.0) (2026-03-21)


### Bug Fixes

* adjust timing in combineLatestWith test for accurate emission sequence ([ad26217](https://github.com/okikio/observables/commit/ad26217855939dfcbfd99b81bfe10a6018dd916f))


### Features

* enhance interoperability with new SubscribableLike interface and improved ObservableInteropInputLike type ([9c70c52](https://github.com/okikio/observables/commit/9c70c52bbcea0487aac4ad0e95aa58320768224c))
* enhance observableInputToStream with subscription management and cancellation support ([f5425aa](https://github.com/okikio/observables/commit/f5425aa1e0485ace2e0b7352eddf58ae8710ca2c))

# [1.2.0](https://github.com/okikio/observables/compare/v1.1.0...v1.2.0) (2026-03-21)


### Features

* add cancellation handling and stream wrapping for operators ([9843b2e](https://github.com/okikio/observables/commit/9843b2ec1806f42e4b75bacae30d7784a18c8c12))
* add indexed predicate operators and enhance existing operators for improved functionality ([df80455](https://github.com/okikio/observables/commit/df804556ea64e24ccdb6ec02feb3292522e7c386))
* add stream and observable integration functions for better interoperability ([53ef4ab](https://github.com/okikio/observables/commit/53ef4ab796a01e4b8144b667fb84970337d833b8))
* enhance combination operators with improved state management and error handling ([f3a13e6](https://github.com/okikio/observables/commit/f3a13e6c68f6a68ae0f38e3b74c25014275b5424))

# [1.1.0](https://github.com/okikio/observables/compare/v1.0.2...v1.1.0) (2026-03-20)


### Features

* add changed operator to emit only distinct values in streams ([7d5bf2a](https://github.com/okikio/observables/commit/7d5bf2a5a2b5e542da6f23105cffe78d039c3f41))

## [1.0.2](https://github.com/okikio/observables/compare/v1.0.1...v1.0.2) (2026-03-18)


### Bug Fixes

* **release:** bootstrap first npm publish with token fallback ([ddc6fe2](https://github.com/okikio/observables/commit/ddc6fe28ee53713d043a49455206c031f75a63cd))
* **release:** publish from release events without npm token ([301341a](https://github.com/okikio/observables/commit/301341ab231059f364fbe968043c1579601aa8c9))
* **release:** run publish jobs after skipped release job ([0839544](https://github.com/okikio/observables/commit/08395449584aa697c15e315e8755986efa602d4a))

## [1.0.1](https://github.com/okikio/observables/compare/v1.0.0...v1.0.1) (2026-03-18)

### Bug Fixes

- **release:** allow publish-only registry retries
  ([b51c952](https://github.com/okikio/observables/commit/b51c9521d5fccc4da0ee3d38ae3f5905d7237221))

# 1.0.0 (2026-03-18)

### Bug Fixes

- a large number of tests
  ([5d0a6c5](https://github.com/okikio/observables/commit/5d0a6c58cd1bcfdda07a89c2c0007691889aeabb))
- broken tests
  ([2ab9031](https://github.com/okikio/observables/commit/2ab9031b95ce97935823516a46d949888af99157))
- **ci:** format events test for actions
  ([885af48](https://github.com/okikio/observables/commit/885af48ab08a9483f6c9abf768f794d3738879f6))
- **ci:** restore import-prefix lint ignores
  ([848d2e0](https://github.com/okikio/observables/commit/848d2e03ecf479b1434ef323ca3c7c3d2485a009))
- deviate from spec. on error handling for observer.next/complete/error
  ([98f2537](https://github.com/okikio/observables/commit/98f2537a01d07a05fcd6fd3bd37284a4651e3624))
- edge case types in timing, pipe and core operations
  ([7fc9324](https://github.com/okikio/observables/commit/7fc93242aca9ee003e4b4e4a09e9f58e4f7b18c6))
- errors breaking readable streams in pull function
  ([44e9c0f](https://github.com/okikio/observables/commit/44e9c0f0d8b4076e8e2f0f23bc02d1fe7354e2af))
- even more tests
  ([4d7c8ba](https://github.com/okikio/observables/commit/4d7c8baf5204d88d22ace51c166255bd35e60ff1))
- events tests
  ([0ebac08](https://github.com/okikio/observables/commit/0ebac08902a7a0201fe14fae6741041bbe74e857))
- **events,operators:** revert empty-subscriber fast path and use
  controller.error
  ([f6b8d69](https://github.com/okikio/observables/commit/f6b8d6996839e9ef5998978369fce8a97b730b17))
- fix incorrect logic for replaying item
  ([ad8cca5](https://github.com/okikio/observables/commit/ad8cca5506066941bb5f8b2e28f90428036d3766))
- fix issues with observables not catch errors
  ([66b2948](https://github.com/okikio/observables/commit/66b29482c82c550d282e37581c4eabef4c999320))
- fix major slow api types blocking publishing
  ([bd84ffb](https://github.com/okikio/observables/commit/bd84ffbbb1532d8a17cb42a25ade255dbb691d44))
- fix operator types
  ([27d12e8](https://github.com/okikio/observables/commit/27d12e8fcb01356a704e23a4a2a9d514c5a3f09d))
- improve type check of assertObservableError
  ([f077868](https://github.com/okikio/observables/commit/f07786805a3fac1e34984f70e6ff0e5245624a0b))
- issues w/ delay timing
  ([b983ede](https://github.com/okikio/observables/commit/b983ede6714df9fc9ad14fffe1f5fe01c58a31a0))
- non-compliance with some specific tc39 observables steps
  ([d5c8318](https://github.com/okikio/observables/commit/d5c83184ff46d9a4ab30adeb4781a4c7f234da9e))
- **observable:** document bound observer methods
  ([b7cffa5](https://github.com/okikio/observables/commit/b7cffa50b47778137123df617859fab67e4c2297))
- **observable:** drop detached observer binding
  ([f700b40](https://github.com/okikio/observables/commit/f700b40e2adf904c67ad634f223d0607de56d403))
- **operators:** restore return short-circuit after controller.error
  ([f5eac66](https://github.com/okikio/observables/commit/f5eac66d370abb0748a544ea28d77e6ca6522743))
- rejection message for waitForEvent
  ([c559d5f](https://github.com/okikio/observables/commit/c559d5f19ad1fa7a609af1548c13b02a2cfce868))
- **release:** tighten validation and green ci
  ([95e4d4d](https://github.com/okikio/observables/commit/95e4d4d0ab8ebc6e268b6500892623183246d575))
- remove queued teardown
  ([8b75e82](https://github.com/okikio/observables/commit/8b75e82536eb44f4538e75c0d73e9117ca5a2ae2))
- **repo:** align benchmark tasks and test harnesses
  ([c72229c](https://github.com/okikio/observables/commit/c72229c6d8630f029b1c6e4ba9426cbde47fe767))
- **review:** address publishing follow-up comments
  ([7959911](https://github.com/okikio/observables/commit/79599114d59d61bf1add0b1f885ef50a35a49e44))
- split close subscription into mark subscription as closed and perform close
  subscription
  ([3996f5f](https://github.com/okikio/observables/commit/3996f5f12636281e004d208ec44c124169eca628))
- **tests:** align BDD coverage with observable error and stream semantics
  ([d81486c](https://github.com/okikio/observables/commit/d81486c2443842ae5480aa5f9093d997aec48265))
- **tests:** polish spec coverage naming
  ([e46a100](https://github.com/okikio/observables/commit/e46a100e35602b2cfa7b4d67a248b44c4813ce64))
- **tests:** preserve standalone assertion messages
  ([c2ce404](https://github.com/okikio/observables/commit/c2ce404206f607a0a07e9d777602afc530c6b409))
- **tests:** resolve remaining review-thread lint and flake issues
  ([cab3df1](https://github.com/okikio/observables/commit/cab3df119e1ef56e3d50418c60d8b54c5d90c8c5))
- type issues with pipe, compose and safeCompose
  ([add210e](https://github.com/okikio/observables/commit/add210eeca72afe59992113830452d175d499cd7))
- update tests to take into account new fixes
  ([812d5e5](https://github.com/okikio/observables/commit/812d5e526dd8a4c903f056e8bd463e0cc317e895))
- **WIP:** fix 1/2 of the typescript type issues in dom_event_tests
  ([1da2571](https://github.com/okikio/observables/commit/1da2571b4b0f3df854eefd6af0008b39ed2d97b3))

### Features

- add AbortSignal support
  ([299b8fe](https://github.com/okikio/observables/commit/299b8fee6ef891eedefc410339a1bad8508d0cba))
- add helpers & operators
  ([7fff07d](https://github.com/okikio/observables/commit/7fff07d4b83044c8f884185acda435ea59b62f2d))
- add isObservable + isSpecObservable methods
  ([faefeb4](https://github.com/okikio/observables/commit/faefeb4c751de144c8dcb7cc861d5dfb698ca956))
- add isObservableError method
  ([4be5fe5](https://github.com/okikio/observables/commit/4be5fe54f9f1fa17870e0e27affbcc4d82b53d6b))
- add observable + event bus
  ([75fa4ed](https://github.com/okikio/observables/commit/75fa4ed98aad7106c0ccdbcb3b4b3985e995d411))
- add operator for throwing errors
  ([a214329](https://github.com/okikio/observables/commit/a21432907f68653254659622240ec543d4bf208d))
- add the values operators, that only operate directly on values while letting
  errors passthrough
  ([7b9823d](https://github.com/okikio/observables/commit/7b9823d348a6db38ecc3aff987656da4fba27f3e))
- add tips to ObservableError
  ([1d25963](https://github.com/okikio/observables/commit/1d25963e80a43c7c95cd4e44ed6d89108c8e7208))
- add withReplay utility function
  ([50881d7](https://github.com/okikio/observables/commit/50881d77df674d97a15dec7e82eef8734aaecfba))
- **bench:** add comparison benchmarks and spec coverage
  ([bd2bde8](https://github.com/okikio/observables/commit/bd2bde8e2efde8bb60055590182015ec31ed26e8))
- **docs:** add comprehensive instruction files and copilot-instructions.md
  ([3112119](https://github.com/okikio/observables/commit/3112119e301e6054515e8d806f9b9b1130c15be1))
- implement helpers using streams internally
  ([e1f5bea](https://github.com/okikio/observables/commit/e1f5beab399dbff213d969faef84f92db57bb047))
- support passing ObservableError as part of the iterator of the `pull` function
  ([1ab2355](https://github.com/okikio/observables/commit/1ab2355a66162a5a8435176231323a1922cf0c47))

### Performance Improvements

- add cap on replay size of 1000
  ([1d52e44](https://github.com/okikio/observables/commit/1d52e446aef05bbaf1f97e8a82707355de3de616))
- **bench:** add latency benchmarks and speed up queue wraparound
  ([5324282](https://github.com/okikio/observables/commit/53242822f96de446c298a00198438cb4e48da895))
- optimize hot-paths
  ([91a6313](https://github.com/okikio/observables/commit/91a6313402b74f56f1feaa9609790c03927f402e))

# Changelog

All notable changes to `@okikio/observables` will be documented in this file.

Releases are generated from Conventional Commits by the `Release and Publish`
workflow, so each published version updates this changelog and the `version`
field in `deno.jsonc` together.
