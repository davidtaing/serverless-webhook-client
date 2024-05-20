import { to as _to } from 'await-to-js'

/**
 * Convenience function that provides syntatic sugar for handling try / catch errors
 * and returning errors as values.
 * @param promise
 * @param errorExt — Additional Information you can pass to the err object
 * @returns an object containing the error and the response.
 */
export async function to<T, U = Error>(promise: Promise<T>, errorExt?: object) {
  const [error, response] = await _to<T, U>(promise, errorExt)
  return { error, response }
}
