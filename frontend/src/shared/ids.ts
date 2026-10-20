/** Match the API's positive unsigned BIGINT IDs without rounding through Number. */
export function isValidId(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value) && BigInt(value) <= 18446744073709551615n
}
