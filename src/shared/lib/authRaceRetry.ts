// A brief window exists right after an OAuth redirect (and, more rarely,
// right after a background tab's token silently refreshes) where React's
// auth state already reflects a signed-in user but the Supabase client's
// session isn't yet fully settled for outgoing requests -- a query fired
// in that window can 401 even though the user is genuinely authenticated.
// Confirmed live: a review_queue count query fired by AppSidebar 401'd
// immediately after a real, successful sign-in.
//
// Wraps a fire-and-forget Supabase call with a single short-delay retry so
// this transient race doesn't need to be reasoned about at every call site.
export async function withAuthRaceRetry<T>(fn: () => PromiseLike<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 800));
    return fn();
  }
}
