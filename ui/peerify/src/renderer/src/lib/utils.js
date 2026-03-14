export const normalizePath = (p) => {
    if (!p) return ''
    return p.replace(/\\/g, '/').toLowerCase().trim()
}

export const comparePaths = (p1, p2) => {
    return normalizePath(p1) === normalizePath(p2)
}

export const fixPath = (p) => {
    if (!p) return null
    if (typeof p !== 'string') return p

    const normalized = p.replace(/\\/g, '/')
    if (
        normalized.startsWith('http') ||
        normalized.startsWith('data:') ||
        normalized.startsWith('media:') ||
        normalized.startsWith('/')
    ) {
        return normalized
    }

    return `media://local/${encodeURIComponent(normalized)}`
}
