import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const jwtSecret = process.env.JWT_SECRET || 'development-only-change-this-secret'

export function hashPassword(password) {
  return bcrypt.hashSync(password, 12)
}

export function verifyPassword(password, storedPassword) {
  if (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2y$')) {
    return bcrypt.compareSync(password, storedPassword)
  }
  return password === storedPassword
}

export function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, permissions: user.permissions }, jwtSecret, { expiresIn: '8h' })
}

export function requireAuth(request, response, next) {
  const header = request.get('authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return response.status(401).json({ message: 'Authentication required.' })
  try {
    request.user = jwt.verify(token, jwtSecret)
    return next()
  } catch {
    return response.status(401).json({ message: 'Invalid or expired authentication token.' })
  }
}

export function requireRole(...roles) {
  return (request, response, next) => {
    if (!roles.includes(request.user?.role)) return response.status(403).json({ message: 'You do not have permission to perform this action.' })
    return next()
  }
}

export function requirePermission(permission) {
  return (request, response, next) => {
    const permissions = request.user?.permissions ?? []
    if (request.user?.role !== 'admin' && !permissions.includes('all') && !permissions.includes(permission)) return response.status(403).json({ message: 'You do not have permission to perform this action.' })
    return next()
  }
}

export function isProductionSecretConfigured() {
  return Boolean(process.env.JWT_SECRET)
}
