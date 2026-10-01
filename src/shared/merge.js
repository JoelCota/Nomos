const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

// Deep-merge `override` onto `base`. Plain objects are merged key by key;
// arrays, primitives and null in `override` replace the base value.
export function mergeDeep(base, override) {
  if (override === undefined) return clone(base)
  if (!isPlainObject(base) || !isPlainObject(override)) return clone(override)
  const out = clone(base)
  for (const [k, v] of Object.entries(override)) {
    out[k] = mergeDeep(base[k], v)
  }
  return out
}

export function clone(v) {
  if (Array.isArray(v)) return v.map(clone)
  if (isPlainObject(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)]))
  return v
}
