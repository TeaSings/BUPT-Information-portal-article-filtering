export async function isReachable(url, timeoutMs = 10000) {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs)
    });
    return {
      ok: true,
      status: response.status
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
}
