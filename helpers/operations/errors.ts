import type { ExcludeError, Operator } from "../_types.ts";
import { ObservableError } from "../../error.ts";
import { createOperator, createStatefulOperator } from "../operators.ts";

/**
 * Removes all errors from your stream, keeping only the good data.
 * 
 * ## What it does
 * Think of this like a bouncer at a club - it only lets the good stuff through and quietly
 * turns away anything that looks like an error. Your stream continues flowing with just
 * the successful data, while errors disappear without a trace.
 * 
 * ## Why you'd want this
 * Sometimes you're building a demo, prototype, or working with data where some failures
 * are totally expected and you just want to focus on what worked. Maybe you're fetching
 * data from 100 different sources and you know 10-15 will fail, but that's fine - you
 * just want the successful ones.
 * 
 * ## How it works
 * Every piece of data flowing through your stream gets checked. If it's an error, 
 * it gets dropped silently. If it's good data, it passes through unchanged. It's like
 * having a filter that only lets clean water through.
 * 
 * ## When to use it
 * - **Demos and prototypes**: When you want clean output without error handling code
 * - **Expected failures**: When some errors are normal and you just want successful results
 * - **Partial success scenarios**: Like processing a list where some items might fail
 * - **Quick and dirty solutions**: When you need something working fast
 * 
 * ## When NOT to use it
 * - **Production critical systems**: You usually want to know when things go wrong
 * - **Debugging**: Errors disappearing makes it hard to figure out what's broken
 * - **When errors are unexpected**: Silent failures can hide real problems
 * 
 * ## The impact
 * **Good**: Your stream becomes clean and predictable - no error handling needed downstream
 * **Bad**: You lose all information about what went wrong and how often
 * **Ugly**: If you have more errors than expected, your stream might become very sparse
 * 
 * ## Edge cases to watch out for
 * - **High error rates**: If 90% of your data is erroring, you'll get very little output
 * - **Silent failures**: You won't know if something is fundamentally broken
 * - **Debugging nightmares**: When something goes wrong, you have no trace of errors
 * 
 * ## What the output looks like
 * ```typescript
 * // Input stream: [1, Error("oops"), 2, Error("fail"), 3]
 * // After ignoreErrors(): [1, 2, 3]
 * // The errors just vanish - no trace they ever existed
 * ```
 * 
 * @template T The type of good data in your stream
 * 
 * @returns A stream operator that silently removes all errors
 * 
 * @example
 * ```typescript
 * // Real example: Processing a list of URLs where some might be broken
 * const workingImages = pipe(
 *   imageUrls, // ["good.jpg", "missing.jpg", "another.jpg", "broken.jpg"]
 *   map(async url => {
 *     const response = await fetch(url);
 *     if (!response.ok) throw new Error(`Failed to load ${url}`);
 *     return { url, size: response.headers.get('content-length') };
 *   }),
 *   ignoreErrors(), // Silently skip broken images
 *   take(10)
 * );
 * 
 * // Output: Only the images that loaded successfully
 * // [
 * //   { url: "good.jpg", size: "12345" },
 * //   { url: "another.jpg", size: "67890" }
 * // ]
 * // No mention of missing.jpg or broken.jpg - they just disappeared
 * ```
 * 
 * @example
 * ```typescript
 * // Demo scenario: Show only successful API calls
 * const demoData = pipe(
 *   apiEndpoints,
 *   map(endpoint => {
 *     // Some endpoints might be down or slow
 *     return fetchWithTimeout(endpoint, 1000);
 *   }),
 *   ignoreErrors(), // Hide any timeouts or failures
 *   map(data => ({ ...data, demo: true }))
 * );
 * 
 * // Perfect for demos - only shows working features
 * ```
 */
export function ignoreErrors<T>(): Operator<T, ExcludeError<T>> {
  return createOperator<T, T>({
    name: 'ignoreErrors',
    ignoreErrors: true,
    transform(chunk, controller) {
      if (!(chunk instanceof ObservableError)) {
        controller.enqueue(chunk as ExcludeError<T>);
      }
      // Errors are silently dropped - like they never happened
    }
  });
}

/**
 * Replaces any errors in your stream with a backup value you provide.
 * 
 * ## What it does
 * This is like having a spare tire in your car. When something goes wrong (you get an error),
 * instead of breaking down, you automatically switch to your backup plan. Every error gets
 * replaced with the same fallback value you specify.
 * 
 * ## Why this matters
 * In real applications, you often need streams to keep flowing even when individual operations
 * fail. Maybe you're loading user profiles and some users don't exist - you'd rather show
 * "Anonymous User" than crash your entire app. Or you're doing calculations and some division
 * by zero happens - you'd rather get 0 than stop everything.
 * 
 * ## The psychology behind it
 * This follows the "graceful degradation" principle - it's better to show something reasonable
 * than to show nothing at all. Users prefer a slightly imperfect experience over a broken one.
 * 
 * ## How it works under the hood
 * Each piece of data gets examined as it flows through. If it's an error, it gets swapped out
 * for your fallback value. If it's good data, it passes through unchanged. The stream never
 * knows errors happened - it just sees a mix of real data and fallback values.
 * 
 * ## When to reach for this
 * - **User-facing applications**: When showing something is better than showing an error
 * - **Data processing pipelines**: When you need to maintain consistent output format
 * - **Integration scenarios**: When external services are unreliable but you need to keep going
 * - **Graceful degradation**: When partial functionality is acceptable
 * 
 * ## When to avoid it
 * - **Financial calculations**: Where a wrong number could be dangerous
 * - **Security systems**: Where errors might indicate attacks
 * - **Debug builds**: Where you want to see what's actually happening
 * 
 * ## The trade-offs
 * **Pro**: Your stream never breaks, users get consistent experience
 * **Con**: You lose error information, might mask real problems
 * **Gotcha**: If you have lots of errors, your data might be mostly fallbacks
 * 
 * ## Nuances to consider
 * - **Fallback quality**: Your fallback should make sense in context
 * - **Error frequency**: High error rates might indicate bigger problems
 * - **Type compatibility**: Fallback must be same type as your good data
 * - **Downstream effects**: Other parts of your app will see fallback values as real data
 * 
 * ## Error scenarios
 * - **Fallback is wrong type**: TypeScript will catch this at compile time
 * - **Fallback causes issues**: If your fallback value triggers problems downstream
 * - **Memory concerns**: If you're creating heavy objects as fallbacks repeatedly
 * 
 * ## What success looks like
 * ```typescript
 * // Input: [user1, Error("not found"), user3, Error("timeout")]
 * // With catchErrors({name: "Anonymous"}):
 * // Output: [user1, {name: "Anonymous"}, user3, {name: "Anonymous"}]
 * // Perfect - consistent output, no broken stream
 * ```
 * 
 * @template T The type of data in your stream (both good data and fallback)
 * 
 * @param fallback The value to use whenever an error occurs. This exact value will be
 *                 inserted into your stream every time something goes wrong.
 * 
 * @returns A stream operator that replaces errors with your chosen fallback
 * 
 * @example
 * ```typescript
 * // Real-world example: User profile loading with fallbacks
 * const userProfiles = pipe(
 *   userIds, // [123, 456, 999, 789]
 *   map(async id => {
 *     const user = await database.getUser(id);
 *     if (!user) throw new Error(`User ${id} not found`);
 *     return user;
 *   }),
 *   catchErrors({ 
 *     id: 'anonymous', 
 *     name: 'Unknown User', 
 *     avatar: 'default.png' 
 *   }),
 *   take(20)
 * );
 * 
 * // Output might look like:
 * // [
 * //   { id: 123, name: 'Alice', avatar: 'alice.png' },     // Real user
 * //   { id: 456, name: 'Bob', avatar: 'bob.png' },       // Real user  
 * //   { id: 'anonymous', name: 'Unknown User', avatar: 'default.png' }, // Fallback for 999
 * //   { id: 789, name: 'Charlie', avatar: 'charlie.png' } // Real user
 * // ]
 * // Your UI can render all of these consistently
 * ```
 * 
 * @example
 * ```typescript
 * // E-commerce scenario: Product prices with fallbacks
 * const productData = pipe(
 *   productIds,
 *   map(async id => {
 *     const price = await priceService.getPrice(id);
 *     if (price === null) throw new Error(`Price not available for ${id}`);
 *     return { productId: id, price, currency: 'USD' };
 *   }),
 *   catchErrors({ 
 *     productId: 'unknown', 
 *     price: 0, 
 *     currency: 'USD' 
 *   }),
 *   filter(item => item.price > 0) // Optionally filter out fallbacks later
 * );
 * 
 * // Keeps your product catalog working even when pricing service has issues
 * ```
 * 
 * @example
 * ```typescript
 * // Mathematical processing with safe fallbacks
 * const calculations = pipe(
 *   numbers, // [10, 5, 0, 20, -3]
 *   map(n => {
 *     if (n <= 0) throw new Error(`Invalid input: ${n}`);
 *     return Math.sqrt(n);
 *   }),
 *   catchErrors(0), // Replace errors with 0
 *   map(result => Math.round(result * 100) / 100) // Round to 2 decimal places
 * );
 * 
 * // Output: [3.16, 2.24, 0, 4.47, 0]
 * // Calculations continue even with invalid inputs
 * ```
 */
export function catchErrors<T, R>(fallback: R): Operator<T, ExcludeError<T> | R> {
  return createOperator<T, ExcludeError<T> | R>({
    name: 'catchErrors',
    ignoreErrors: false,
    transform(chunk, controller) {
      if (chunk instanceof ObservableError) {
        controller.enqueue(fallback);
      } else {
        controller.enqueue(chunk as ExcludeError<T>);
      }
    }
  }) as Operator<T, ExcludeError<T> | R>;
}

/**
 * Transforms errors into custom values using your own logic.
 * 
 * ## What this does
 * This is like having a personal translator for errors. Instead of just replacing all errors
 * with the same thing (like catchErrors), you get to examine each error individually and 
 * decide what to do with it. Maybe network errors become retry commands, validation errors
 * become user messages, and critical errors become alerts.
 * 
 * ## Why this is powerful
 * In real applications, different errors need different handling. A "user not found" error
 * is very different from a "database connection lost" error. This function lets you handle
 * each type appropriately while keeping your data flowing.
 * 
 * ## The philosophy
 * This follows the principle that "errors are data too." Instead of treating errors as
 * exceptional cases that break your flow, you transform them into useful information that
 * becomes part of your data stream. It's like turning problems into opportunities.
 * 
 * ## How the transformation works
 * When an error flows through, your transformer function gets called with the full error
 * object. You can look at the error message, see where it came from, check the original
 * cause, and then return whatever makes sense for your application. The error gets replaced
 * with your custom value.
 * 
 * ## When you need this level of control
 * - **User interfaces**: Different errors need different user messages
 * - **Monitoring systems**: You want to categorize and log errors differently
 * - **Retry logic**: Some errors should trigger retries, others shouldn't
 * - **Graceful degradation**: Different failures need different fallback behaviors
 * - **Error analytics**: You want to track error patterns and frequencies
 * 
 * ## When simpler options are better
 * - **Prototypes**: Where you just want errors to go away
 * - **Simple cases**: Where all errors should be handled the same way
 * - **Performance critical**: Where the transformation overhead matters
 * 
 * ## What's inside an error object
 * Every error gives you access to:
 * - **message**: What went wrong ("Network timeout", "User not found")
 * - **context**: Where it happened ("map:operator[2]", "database:query")
 * - **originalError**: The raw error that was thrown
 * - **stack**: Stack trace information (when available)
 * 
 * ## The ripple effects
 * **Positive**: You get intelligent error handling that makes your app more resilient
 * **Negative**: More complex code that needs more testing
 * **Hidden**: Your error mapper function itself can throw errors (we handle this)
 * 
 * ## Edge cases that bite
 * - **Mapper throws errors**: We catch these and create new error objects
 * - **Null/undefined returns**: These get passed through as-is
 * - **Heavy transformations**: Can slow down your stream if errors are frequent
 * - **Memory leaks**: Be careful not to hold onto error objects longer than needed
 * 
 * ## What good output looks like
 * ```typescript
 * // Input: [data1, NetworkError("timeout"), data2, ValidationError("invalid email")]
 * // With smart error mapping:
 * // Output: [data1, {retry: true, delay: 5000}, data2, {showMessage: "Please check your email"}]
 * // Each error became actionable information
 * ```
 * 
 * @template T The type of successful data in your stream
 * @template E The type your errors will become after transformation
 * 
 * @param errorMapper A function that receives an error and returns whatever you want to
 *                    replace it with. This function gets called for every error and can
 *                    return different things based on error type, message, or context.
 * 
 * @returns A stream operator that transforms errors using your custom logic
 * 
 * @example
 * ```typescript
 * // Real example: Smart error handling for a social media app
 * const socialPosts = pipe(
 *   userIds,
 *   map(async userId => {
 *     const posts = await api.getUserPosts(userId);
 *     if (posts.length === 0) throw new Error(`No posts for user ${userId}`);
 *     if (posts.some(p => p.private)) throw new Error(`Private posts for user ${userId}`);
 *     return posts;
 *   }),
 *   mapErrors(error => {
 *     if (error.message.includes('No posts')) {
 *       return {
 *         type: 'empty_feed',
 *         message: 'This user hasn\'t posted anything yet',
 *         showSuggestions: true
 *       };
 *     } else if (error.message.includes('Private posts')) {
 *       return {
 *         type: 'privacy_restriction', 
 *         message: 'This user\'s posts are private',
 *         showFollowButton: true
 *       };
 *     } else {
 *       return {
 *         type: 'unknown_error',
 *         message: 'Something went wrong loading posts',
 *         allowRetry: true
 *       };
 *     }
 *   }),
 *   take(50)
 * );
 * 
 * // Output includes both real posts and smart error responses:
 * // [
 * //   [post1, post2, post3], // Real posts
 * //   { type: 'empty_feed', message: '...', showSuggestions: true }, // Transformed error
 * //   [post4, post5], // More real posts
 * //   { type: 'privacy_restriction', message: '...', showFollowButton: true } // Another error
 * // ]
 * ```
 * 
 * @example
 * ```typescript
 * // E-commerce example: Payment processing with intelligent error handling
 * const paymentResults = pipe(
 *   paymentRequests,
 *   map(async payment => {
 *     const result = await paymentProcessor.charge(payment);
 *     if (!result.success) throw new Error(`Payment failed: ${result.reason}`);
 *     return { success: true, transactionId: result.id, amount: payment.amount };
 *   }),
 *   mapErrors(error => {
 *     const reason = error.message.split(': ')[1];
 *     
 *     if (reason?.includes('insufficient funds')) {
 *       return {
 *         success: false,
 *         reason: 'insufficient_funds',
 *         userMessage: 'Your card was declined due to insufficient funds',
 *         suggestedAction: 'try_different_card',
 *         retryable: false
 *       };
 *     } else if (reason?.includes('expired card')) {
 *       return {
 *         success: false,
 *         reason: 'expired_card',
 *         userMessage: 'Your card has expired',
 *         suggestedAction: 'update_payment_method',
 *         retryable: false
 *       };
 *     } else if (reason?.includes('network')) {
 *       return {
 *         success: false,
 *         reason: 'network_error',
 *         userMessage: 'Connection problem - please try again',
 *         suggestedAction: 'retry',
 *         retryable: true,
 *         retryDelay: 3000
 *       };
 *     } else {
 *       return {
 *         success: false,
 *         reason: 'unknown',
 *         userMessage: 'Payment failed - please contact support',
 *         suggestedAction: 'contact_support',
 *         retryable: false
 *       };
 *     }
 *   }),
 *   // Now you can handle each type of result appropriately
 *   tap(result => {
 *     if (!result.success && result.retryable) {
 *       console.log(`Will retry payment in ${result.retryDelay}ms`);
 *     }
 *   })
 * );
 * ```
 * 
 * @example
 * ```typescript
 * // System monitoring: Transform errors into actionable alerts
 * const systemHealth = pipe(
 *   healthChecks,
 *   map(async check => {
 *     const result = await performHealthCheck(check.service);
 *     if (!result.healthy) throw new Error(`${check.service} is down: ${result.details}`);
 *     return { service: check.service, status: 'healthy', responseTime: result.responseTime };
 *   }),
 *   mapErrors(error => {
 *     const [service, issue] = error.message.split(' is down: ');
 *     const severity = getSeverity(service, issue);
 *     
 *     return {
 *       service,
 *       status: 'unhealthy',
 *       issue,
 *       severity,
 *       alert: severity >= 8, // High severity gets alerts
 *       autoRestart: ['database', 'cache'].includes(service),
 *       escalate: severity >= 9,
 *       timestamp: Date.now(),
 *       context: error.context
 *     };
 *   }),
 *   // Now you can filter by severity, trigger alerts, etc.
 *   tap(result => {
 *     if (result.status === 'unhealthy' && result.alert) {
 *       sendAlert(`${result.service} is down: ${result.issue}`);
 *     }
 *   })
 * );
 * 
 * // Output gives you actionable information for each service:
 * // [
 * //   { service: 'api', status: 'healthy', responseTime: 45 },
 * //   { service: 'database', status: 'unhealthy', severity: 9, alert: true, escalate: true },
 * //   { service: 'cache', status: 'healthy', responseTime: 12 }
 * // ]
 * ```
 */
export function mapErrors<T, E>(
  errorMapper: (error: ObservableError) => E
) {
  return createOperator<T, ExcludeError<T> | E>({
    name: 'mapErrors',
    ignoreErrors: false,
    transform(chunk, controller) {
      if (chunk instanceof ObservableError) {
        try {
          const mappedError = errorMapper(chunk);
          controller.enqueue(mappedError);
        } catch (mapperError) {
          // If your error mapper itself breaks, we create a new error
          // This prevents infinite error loops
          throw new ObservableError(
            [mapperError, chunk],
            `Your error mapper function threw an error: ${mapperError}`,
            {
              operator: 'mapErrors:mapper',
              value: mapperError,
              cause: chunk,
              tip: 'Some logic within the mappErrors operator seems to have thrown an error. Check your mapErrors function for bugs'
            }
          );
        }
      } else {
        controller.enqueue(chunk as ExcludeError<T>);
      }
    }
  }) as Operator<T, ExcludeError<T> | E>;
}

/**
 * Keeps only the errors from your stream, throwing away all the good data.
 * 
 * ## What this does
 * This is the opposite of ignoreErrors - it keeps only the problems and throws away
 * everything that worked. Think of it like a quality inspector that only collects
 * the defective items to study what went wrong.
 * 
 * ## Why you'd want this
 * Sometimes you want to analyze your failures separately from your successes. Maybe
 * you're running a batch job and want to see what percentage failed, or you're
 * debugging and only care about the problems.
 * 
 * ## What you get
 * A stream that contains only ObservableError objects. Each one has full details
 * about what went wrong, where it happened, and the original cause.
 * 
 * @example
 * ```typescript
 * // Collect all failures for analysis
 * const failureAnalysis = pipe(
 *   dataProcessing,
 *   onlyErrors(),
 *   mapErrors(error => ({
 *     type: error.context,
 *     message: error.message,
 *     timestamp: Date.now(),
 *     frequency: 1
 *   })),
 *   // Could group by type, count frequencies, etc.
 *   toArray()
 * );
 * ```
 */
export function onlyErrors<T>(): Operator<T, ObservableError> {
  return createOperator<T, ObservableError>({
    name: 'onlyErrors',
    ignoreErrors: false,
    transform(chunk, controller) {
      if (chunk instanceof ObservableError) {
        controller.enqueue(chunk);
      }
      // Good data gets filtered out
    }
  });
}

/**
 * Counts how many things succeeded vs failed in your entire stream.
 * 
 * ## What this does
 * Processes your whole stream and gives you a summary at the end showing how many
 * operations succeeded, how many failed, and what your success rate was. Like a
 * quality report for your data processing.
 * 
 * ## When this is useful
 * - **Batch processing**: See how much of your batch succeeded
 * - **Quality monitoring**: Track success rates over time
 * - **Performance analysis**: Understand failure patterns
 * - **Reporting**: Generate summaries for stakeholders
 * 
 * ## What the output looks like
 * You get a single object with counts and percentages:
 * ```typescript
 * {
 *   successCount: 85,
 *   errorCount: 15, 
 *   totalProcessed: 100,
 *   successRate: 0.85 // 85% success rate
 * }
 * ```
 * 
 * @example
 * ```typescript
 * const batchSummary = pipe(
 *   largeBatchOfData,
 *   map(item => processItem(item)), // Some will succeed, some will fail
 *   summarizeErrors()
 * );
 * 
 * // Output: { successCount: 847, errorCount: 53, totalProcessed: 900, successRate: 0.94 }
 * // Great! 94% success rate
 * ```
 */
export function summarizeErrors<T>(): Operator<T, {
  successCount: number;
  errorCount: number;
  totalProcessed: number;
  successRate: number;
}> {
  return createStatefulOperator<T,
    {
      successCount: number;
      errorCount: number;
      totalProcessed: number;
      successRate: number;
    },
    { successCount: number, errorCount: number }
  >({
    name: 'summarizeErrors',
    ignoreErrors: true,
    createState: () => ({ successCount: 0, errorCount: 0 }),
    transform(chunk, state) {
      if (chunk instanceof ObservableError) {
        state.errorCount++;
      } else {
        state.successCount++;
      }
    },
    flush(state, controller) {
      const total = state.successCount + state.errorCount;
      controller.enqueue({
        successCount: state.successCount,
        errorCount: state.errorCount,
        totalProcessed: total,
        successRate: total > 0 ? state.successCount / total : 0
      });
    }
  });
}

