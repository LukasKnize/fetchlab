export function formatJson(str) {
  try {
    return JSON.stringify(JSON.parse(str), null, 2)
  } catch {
    return null
  }
}

export function isValidJson(str) {
  if (!str || !str.trim()) return true // empty is fine
  try {
    JSON.parse(str)
    return true
  } catch {
    return false
  }
}

export function getJsonError(str) {
  if (!str || !str.trim()) return null
  try {
    JSON.parse(str)
    return null
  } catch (e) {
    return e.message
  }
}
